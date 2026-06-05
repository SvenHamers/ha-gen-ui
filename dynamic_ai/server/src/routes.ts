import type { FastifyInstance } from "fastify";
import {
  ActionRefSchema,
  type ChatMessageDTO,
  type ChatRequest,
  type EntityInfo,
  type ExposureConfig,
  type ServerEvent,
} from "@dyn/shared";
import { getPublicSettings, resolveProvider, type AppConfig } from "./config";
import { buildExposure, entityIdsOf } from "./exposure";
import { HaClient } from "./ha/client";
import { createProvider } from "./ai/factory";
import { runChat } from "./ai/orchestrator";
import { buildSystemPrompt } from "./ai/systemPrompt";
import { actionDisposition, buildToolDefs, executeActionNow, executeTool, summarizeEntities } from "./ai/tools";
import type { NeutralMessage } from "./ai/types";
import { ConversationStore } from "./store/conversations";
import { SettingsStore } from "./store/settings";
import { log } from "./logger";

export interface RouteDeps {
  cfg: AppConfig;
  ha: HaClient;
  store: ConversationStore;
  settings: SettingsStore;
}

export function registerRoutes(app: FastifyInstance, deps: RouteDeps) {
  const { cfg, ha, store, settings } = deps;

  // Fresh exposure predicate per request (reflects live edits from the UI).
  const makeExposed = () => {
    const e = settings.getExposure();
    return buildExposure(e.mode, e.entities);
  };

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/settings", async () => {
    const connected = await ha.ping();
    return getPublicSettings(cfg, connected, settings.getExposure());
  });

  // All HA entities (compact) with their current exposed flag — for the picker.
  app.get("/api/entities", async () => {
    const states = await ha.getStates().catch(() => []);
    const exposed = makeExposed();
    const list: EntityInfo[] = states.map((s) => ({
      entity_id: s.entity_id,
      name: s.attributes?.friendly_name || s.entity_id,
      domain: s.entity_id.split(".")[0],
      state: s.state,
      exposed: exposed(s.entity_id),
    }));
    list.sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name));
    return list;
  });

  app.get("/api/exposure", async () => settings.getExposure());
  app.put("/api/exposure", async (req) => {
    const body = (req.body || {}) as ExposureConfig;
    return settings.setExposure({
      mode: body.mode === "list" ? "list" : "all",
      entities: Array.isArray(body.entities) ? body.entities : [],
    });
  });

  app.get("/api/ha/ping", async () => ({ connected: await ha.ping() }));

  // ---- streaming chat (Server-Sent Events over POST) -----------------------
  app.post("/api/chat", async (req, reply) => {
    const body = (req.body || {}) as ChatRequest;
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const write = (ev: ServerEvent) => raw.write(`data: ${JSON.stringify(ev)}\n\n`);

    const providerId = resolveProvider(cfg, body.provider);
    if (!providerId) {
      write({ type: "error", message: "No AI provider key configured. Add an OpenAI or Anthropic key in the add-on settings (or .env)." });
      write({ type: "done" });
      raw.end();
      return;
    }

    // Abort if the client disconnects. Listen on the RESPONSE socket: the
    // request stream emits "close" as soon as its body is read, which would
    // abort us before we even start.
    const ac = new AbortController();
    raw.on("close", () => ac.abort());

    const messages: NeutralMessage[] = (body.messages || []).map((m) => ({ role: m.role, content: m.content }));

    try {
      const provider = createProvider(cfg, providerId);
      for await (const ev of runChat({ cfg, ha, provider, messages, isExposed: makeExposed(), signal: ac.signal })) {
        write(ev);
      }
    } catch (err) {
      log.error("chat error:", (err as Error).message);
      write({ type: "error", message: (err as Error).message });
      write({ type: "done" });
    }

    // Persist the text transcript (rich UI is ephemeral in v1).
    if (body.conversationId) {
      try {
        const dto: ChatMessageDTO[] = messages
          .filter((m) => m.role === "user" || (m.role === "assistant" && m.content))
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content || "" }));
        store.save(body.conversationId, dto);
      } catch (err) {
        log.warn("persist failed:", (err as Error).message);
      }
    }
    raw.end();
  });

  // ---- run a named action (user clicked confirm / a button / toggle) -------
  app.post("/api/action", async (req, reply) => {
    const parsed = ActionRefSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "Invalid action" });
    const action = parsed.data;
    const exposed = makeExposed();
    const notExposed = entityIdsOf(action.target).filter((id) => !exposed(id));
    if (notExposed.length) return reply.code(403).send({ ok: false, error: `Not exposed to the assistant: ${notExposed.join(", ")}` });
    if (actionDisposition(cfg, action.domain) === "blocked") {
      return reply.code(403).send({ ok: false, error: `Domain '${action.domain}' is not allowed.` });
    }
    try {
      const res = await executeActionNow({ cfg, ha, isExposed: exposed }, action);
      return { ok: true, message: res.message, state: res.state ? { entity_id: res.state.entity_id, state: res.state.state } : undefined };
    } catch (err) {
      return reply.code(502).send({ ok: false, error: (err as Error).message });
    }
  });

  // ---- voice: mint an ephemeral Realtime session + hand over tools ---------
  app.post("/api/realtime/session", async (_req, reply) => {
    if (!cfg.openaiApiKey) return reply.code(400).send({ error: "No OpenAI key configured (voice needs OpenAI)." });
    try {
      // Mint an ephemeral client secret bound to the voice model + voice. Tools
      // and turn detection are applied by the client via session.update.
      const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.openaiApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ session: { type: "realtime", model: cfg.voiceModel, audio: { output: { voice: cfg.voiceName } } } }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        return reply.code(502).send({ error: `OpenAI realtime token failed: ${r.status} ${t.slice(0, 300)}` });
      }
      const data = (await r.json()) as any;
      const token = data?.value;
      if (!token) return reply.code(502).send({ error: "OpenAI did not return an ephemeral token." });

      const states = await ha.getStates().catch(() => []);
      const sum = summarizeEntities(states, makeExposed());
      const instructions = buildSystemPrompt({
        allowedDomains: cfg.allowedDomains,
        confirmDomains: cfg.confirmDomains,
        entityLines: sum.lines,
        entityTotal: sum.total,
        language: cfg.language,
      });
      const tools = buildToolDefs().map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters }));
      return { token, instructions, tools, language: cfg.language };
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
  });

  // ---- voice: execute a tool the realtime model called ---------------------
  app.post("/api/realtime/tool", async (req) => {
    const body = (req.body || {}) as { name?: string; arguments?: unknown };
    let input: any = body.arguments;
    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch {
        input = {};
      }
    }
    const res = await executeTool(String(body.name), input || {}, { cfg, ha, isExposed: makeExposed() });
    return { ok: res.ok, result: res.modelResult, ui: res.ui ?? null, summary: res.summary ?? null, error: res.error ?? null };
  });

  // ---- conversations -------------------------------------------------------
  app.get("/api/conversations", async () => store.list());
  app.get("/api/conversations/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const c = store.get(id);
    if (!c) return reply.code(404).send({ error: "not found" });
    return c;
  });
  app.delete("/api/conversations/:id", async (req) => {
    store.delete((req.params as { id: string }).id);
    return { ok: true };
  });
}
