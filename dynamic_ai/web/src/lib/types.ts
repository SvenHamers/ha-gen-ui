import type { UiNode } from "@dyn/shared";

/** A piece of a rendered message: prose, a generative-UI tree, or a tool chip. */
export type Part =
  | { kind: "text"; text: string }
  | { kind: "ui"; id: string; tree: UiNode }
  | { kind: "tool"; id: string; name: string; status: "running" | "ok" | "error"; summary?: string; error?: string };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
  ts: number;
  /** transient: assistant is still streaming */
  streaming?: boolean;
}
