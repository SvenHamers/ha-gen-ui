import type { UiNode } from "./ui";

/**
 * Typed events the backend streams to the frontend (over SSE for text chat).
 * The frontend is a *renderer* of this stream: `text` paints prose,
 * `tool_call`/`tool_result` drive animated action feedback, and `ui` draws a
 * generative building-block tree.
 */
export type ServerEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; ok: boolean; summary?: string; error?: string }
  | { type: "ui"; id: string; tree: UiNode }
  | { type: "status"; message: string }
  | { type: "title"; title: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type ServerEventType = ServerEvent["type"];
