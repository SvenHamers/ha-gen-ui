import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, NeutralMessage, StreamTurnOpts } from "../types";

/** Convert provider-neutral messages into the Anthropic Messages shape. */
function toAnthropicMessages(messages: NeutralMessage[]): any[] {
  const out: any[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content || "" });
    } else if (m.role === "assistant") {
      const content: any[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls || []) {
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input ?? {} });
      }
      out.push({ role: "assistant", content: content.length ? content : m.content || "" });
    } else if (m.role === "tool") {
      const block = { type: "tool_result", tool_use_id: m.toolCallId, content: m.content || "" };
      const last = out[out.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
    }
  }
  return out;
}

export function createAnthropicProvider(apiKey: string, model: string): LlmProvider {
  const client = new Anthropic({ apiKey });
  return {
    id: "anthropic",
    model,
    async *streamTurn({ system, messages, tools, signal }: StreamTurnOpts) {
      const stream = client.messages.stream(
        {
          model,
          max_tokens: 4096,
          system,
          messages: toAnthropicMessages(messages),
          tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
        } as any,
        { signal } as any,
      );

      const blocks = new Map<number, { type: string; id?: string; name?: string; json: string }>();
      let stopReason = "stop";

      for await (const event of stream as any) {
        if (event.type === "content_block_start") {
          const cb = event.content_block;
          blocks.set(event.index, { type: cb.type, id: cb.id, name: cb.name, json: "" });
        } else if (event.type === "content_block_delta") {
          const d = event.delta;
          if (d.type === "text_delta") {
            yield { type: "text", delta: d.text };
          } else if (d.type === "input_json_delta") {
            const b = blocks.get(event.index);
            if (b) b.json += d.partial_json;
          }
        } else if (event.type === "content_block_stop") {
          const b = blocks.get(event.index);
          if (b && b.type === "tool_use") {
            let input: any = {};
            try {
              input = b.json ? JSON.parse(b.json) : {};
            } catch {
              input = {};
            }
            yield { type: "tool_call", id: b.id!, name: b.name!, input };
          }
        } else if (event.type === "message_delta") {
          if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        }
      }
      yield { type: "stop", reason: stopReason };
    },
  };
}
