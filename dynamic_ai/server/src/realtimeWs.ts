import type { FastifyInstance } from "fastify";
import { WebSocket, WebSocketServer } from "ws";
import type { AppConfig } from "./config";
import { buildExposure } from "./exposure";
import { HaClient } from "./ha/client";
import { buildSystemPrompt } from "./ai/systemPrompt";
import { buildToolDefs, executeTool, summarizeEntities } from "./ai/tools";
import type { SettingsStore } from "./store/settings";
import { log } from "./logger";

/**
 * WebSocket voice relay: browser ⇄ this server ⇄ OpenAI Realtime (WebSocket).
 * Avoids WebRTC/RTCPeerConnection entirely, so it works in the Home Assistant
 * Companion app's webview (where Assist's mic works but WebRTC is absent).
 * The real API key stays here; tools run server-side and push UI to the client.
 *
 * Browser → server: binary frames = mic PCM16 mono @ 24 kHz.
 * Server → browser: binary frames = playback PCM16 @ 24 kHz; JSON text = control
 * events (ready, assistant_text, user_text, ui, clear_audio, error).
 */
export function attachRealtimeWs(app: FastifyInstance, deps: { cfg: AppConfig; ha: HaClient; settings: SettingsStore }) {
  const { cfg, ha, settings } = deps;
  const wss = new WebSocketServer({ noServer: true });

  app.server.on("upgrade", (req, socket, head) => {
    const path = (req.url || "").split("?")[0];
    if (!path.endsWith("/api/realtime/ws")) return;
    wss.handleUpgrade(req, socket as any, head, (client) => bridge(client));
  });

  async function bridge(client: WebSocket) {
    const sendClient = (obj: unknown) => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(obj));
    };
    if (!cfg.openaiApiKey) {
      sendClient({ type: "error", message: "No OpenAI key configured (voice needs OpenAI)." });
      client.close();
      return;
    }

    const exposure = settings.getExposure();
    const isExposed = buildExposure(exposure.mode, exposure.entities);
    const states = await ha.getStates().catch(() => []);
    const sum = summarizeEntities(states, isExposed);
    const instructions = buildSystemPrompt({
      allowedDomains: cfg.allowedDomains,
      confirmDomains: cfg.confirmDomains,
      entityLines: sum.lines,
      entityTotal: sum.total,
      language: cfg.language,
    });
    const tools = buildToolDefs().map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters }));

    const upstream = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(cfg.voiceModel)}`, {
      headers: { Authorization: `Bearer ${cfg.openaiApiKey}` },
    });

    let assistantBuf = "";

    upstream.on("open", () => {
      upstream.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            instructions,
            tools,
            tool_choice: "auto",
            output_modalities: ["audio"],
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                turn_detection: { type: "server_vad" },
                transcription: { model: "gpt-4o-mini-transcribe", ...(cfg.language ? { language: cfg.language } : {}) },
              },
              output: { format: { type: "audio/pcm", rate: 24000 }, voice: cfg.voiceName },
            },
          },
        }),
      );
      sendClient({ type: "ready" });
    });

    upstream.on("message", async (data: WebSocket.RawData) => {
      let ev: any;
      try {
        ev = JSON.parse(data.toString());
      } catch {
        return;
      }
      const t: string = ev.type || "";
      if (t === "response.output_audio.delta" && ev.delta) {
        if (client.readyState === WebSocket.OPEN) client.send(Buffer.from(ev.delta, "base64"), { binary: true });
      } else if (t.endsWith("output_audio_transcript.delta")) {
        assistantBuf += ev.delta || "";
        sendClient({ type: "assistant_text", text: assistantBuf });
      } else if (t.endsWith("output_audio_transcript.done") || t === "response.done") {
        if (assistantBuf) {
          sendClient({ type: "assistant_done" });
          assistantBuf = "";
        }
      } else if (t === "conversation.item.input_audio_transcription.completed") {
        if (ev.transcript) sendClient({ type: "user_text", text: ev.transcript });
      } else if (t === "input_audio_buffer.speech_started") {
        sendClient({ type: "clear_audio" });
      } else if (t === "response.function_call_arguments.done") {
        let input: any = {};
        try {
          input = ev.arguments ? JSON.parse(ev.arguments) : {};
        } catch {
          /* ignore */
        }
        const res = await executeTool(ev.name, input, { cfg, ha, isExposed });
        if (res.ui) sendClient({ type: "ui", tree: res.ui });
        upstream.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: ev.call_id, output: res.modelResult } }));
        upstream.send(JSON.stringify({ type: "response.create" }));
      } else if (t === "error") {
        sendClient({ type: "error", message: ev.error?.message || "Voice error" });
      }
    });

    upstream.on("error", (e: Error) => sendClient({ type: "error", message: "Upstream voice error: " + e.message }));
    upstream.on("close", () => {
      if (client.readyState === WebSocket.OPEN) client.close();
    });

    client.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
      if (!isBinary) return; // text control messages currently unused
      if (upstream.readyState !== WebSocket.OPEN) return;
      const b64 = Buffer.isBuffer(data) ? data.toString("base64") : Buffer.from(data as ArrayBuffer).toString("base64");
      upstream.send(JSON.stringify({ type: "input_audio_buffer.append", audio: b64 }));
    });
    client.on("close", () => {
      try {
        upstream.close();
      } catch {
        /* ignore */
      }
    });
    client.on("error", () => {
      try {
        upstream.close();
      } catch {
        /* ignore */
      }
    });

    log.info("[voice-ws] bridge opened");
  }
}
