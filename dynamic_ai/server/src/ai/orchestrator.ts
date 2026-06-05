import type { ServerEvent } from "@dyn/shared";
import type { AppConfig } from "../config";
import { HaClient } from "../ha/client";
import { buildSystemPrompt } from "./systemPrompt";
import { buildToolDefs, executeTool, summarizeEntities, type ToolContext } from "./tools";
import type { LlmProvider, NeutralMessage } from "./types";
import { log } from "../logger";

export interface RunChatOpts {
  cfg: AppConfig;
  ha: HaClient;
  provider: LlmProvider;
  /** Conversation so far; mutated in place as the loop runs. */
  messages: NeutralMessage[];
  /** Exposure predicate — which entities the assistant may see/control. */
  isExposed: (entityId: string) => boolean;
  signal?: AbortSignal;
}

const MAX_ITERS = 8;

/**
 * The agentic loop: stream the model, run any tool calls against Home Assistant,
 * feed results back, repeat until the model answers with no more tools. Yields
 * the typed events the frontend renders.
 */
export async function* runChat(opts: RunChatOpts): AsyncGenerator<ServerEvent> {
  const { cfg, ha, provider, messages, signal, isExposed } = opts;
  const tools = buildToolDefs();
  const ctx: ToolContext = { cfg, ha, isExposed };

  // Ground the model with a fresh snapshot of the home (best effort).
  let entityLines: string[] = [];
  let entityTotal = 0;
  try {
    const states = await ha.getStates();
    const sum = summarizeEntities(states, isExposed);
    entityLines = sum.lines;
    entityTotal = sum.total;
    log.info(`[chat] grounded with ${entityTotal} entities`);
  } catch (e) {
    log.warn("[chat] HA states failed:", (e as Error).message);
  }
  const system = buildSystemPrompt({ allowedDomains: cfg.allowedDomains, confirmDomains: cfg.confirmDomains, entityLines, entityTotal, language: cfg.language });
  log.info(`[chat] calling ${provider.id}/${provider.model}…`);

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    if (signal?.aborted) return;

    let assistantText = "";
    const toolCalls: { id: string; name: string; input: any }[] = [];

    for await (const ev of provider.streamTurn({ system, messages, tools, signal })) {
      if (ev.type === "text") {
        assistantText += ev.delta;
        yield { type: "text", delta: ev.delta };
      } else if (ev.type === "tool_call") {
        toolCalls.push({ id: ev.id, name: ev.name, input: ev.input });
      }
    }

    messages.push({
      role: "assistant",
      content: assistantText || undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
    });

    if (toolCalls.length === 0) {
      yield { type: "done" };
      return;
    }

    for (const tc of toolCalls) {
      if (signal?.aborted) return;
      yield { type: "tool_call", id: tc.id, name: tc.name, args: tc.input };
      const res = await executeTool(tc.name, tc.input, ctx);
      if (res.ui) yield { type: "ui", id: tc.id, tree: res.ui };
      yield { type: "tool_result", id: tc.id, ok: res.ok, summary: res.summary, error: res.error };
      messages.push({ role: "tool", toolCallId: tc.id, toolName: tc.name, content: res.modelResult });
    }
  }

  yield { type: "status", message: "Reached the tool-iteration limit." };
  yield { type: "done" };
}
