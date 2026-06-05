import type { Provider } from "@dyn/shared";

/** A tool exposed to the model. `parameters` is a JSON Schema object. */
export interface ToolDef {
  name: string;
  description: string;
  parameters: object;
}

/** Provider-neutral conversation message. Providers convert to their own shape. */
export interface NeutralMessage {
  role: "user" | "assistant" | "tool";
  /** Assistant/user text. */
  content?: string;
  /** Assistant tool calls. */
  toolCalls?: { id: string; name: string; input: any }[];
  /** Tool-result linkage (role === "tool"). */
  toolCallId?: string;
  toolName?: string;
}

/** Streaming events normalized across providers. */
export type LlmStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; input: any }
  | { type: "stop"; reason: string };

export interface StreamTurnOpts {
  system: string;
  messages: NeutralMessage[];
  tools: ToolDef[];
  signal?: AbortSignal;
}

export interface LlmProvider {
  id: Provider;
  model: string;
  streamTurn(opts: StreamTurnOpts): AsyncGenerator<LlmStreamEvent>;
}
