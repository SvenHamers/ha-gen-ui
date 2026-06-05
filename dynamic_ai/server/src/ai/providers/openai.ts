import OpenAI from "openai";
import type { LlmProvider, NeutralMessage, StreamTurnOpts } from "../types";

/** Convert provider-neutral messages into the OpenAI chat shape. */
function toOpenAiMessages(system: string, messages: NeutralMessage[]): any[] {
  const out: any[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content || "" });
    } else if (m.role === "assistant") {
      const msg: any = { role: "assistant", content: m.content || "" };
      if (m.toolCalls?.length) {
        msg.content = m.content || null;
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.input ?? {}) },
        }));
      }
      out.push(msg);
    } else if (m.role === "tool") {
      out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content || "" });
    }
  }
  return out;
}

export function createOpenAiProvider(apiKey: string, model: string): LlmProvider {
  const client = new OpenAI({ apiKey });
  return {
    id: "openai",
    model,
    async *streamTurn({ system, messages, tools, signal }: StreamTurnOpts) {
      const stream = await client.chat.completions.create(
        {
          model,
          stream: true,
          messages: toOpenAiMessages(system, messages),
          tools: tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
        } as any,
        { signal } as any,
      );

      const calls = new Map<number, { id: string; name: string; args: string }>();
      let stopReason = "stop";

      for await (const chunk of stream as any) {
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;
        if (delta?.content) yield { type: "text", delta: delta.content };
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const cur = calls.get(idx) || { id: "", name: "", args: "" };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name = tc.function.name;
            if (tc.function?.arguments) cur.args += tc.function.arguments;
            calls.set(idx, cur);
          }
        }
        if (choice.finish_reason) stopReason = choice.finish_reason;
      }

      for (const c of calls.values()) {
        let input: any = {};
        try {
          input = c.args ? JSON.parse(c.args) : {};
        } catch {
          input = {};
        }
        yield { type: "tool_call", id: c.id || `call_${c.name}`, name: c.name, input };
      }
      yield { type: "stop", reason: stopReason };
    },
  };
}
