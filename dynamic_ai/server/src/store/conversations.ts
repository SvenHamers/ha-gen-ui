import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ChatMessageDTO } from "@dyn/shared";
import { log } from "../logger";

export interface StoredConversation {
  id: string;
  title: string;
  messages: ChatMessageDTO[];
  createdAt: number;
  updatedAt: number;
}
export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
}

/**
 * File-backed conversation store. Lives in the add-on's persistent /data dir
 * (or ./data locally), so transcripts survive restarts. (Rich generative UI is
 * ephemeral in v1 — only the text transcript is persisted.)
 */
export class ConversationStore {
  private file: string;
  private data: Record<string, StoredConversation> = {};

  constructor(dataDir: string) {
    this.file = path.join(dataDir, "conversations.json");
    try {
      mkdirSync(dataDir, { recursive: true });
      if (existsSync(this.file)) this.data = JSON.parse(readFileSync(this.file, "utf8"));
    } catch (err) {
      log.warn("Could not load conversation store:", (err as Error).message);
    }
  }

  private persist() {
    try {
      writeFileSync(this.file, JSON.stringify(this.data));
    } catch (err) {
      log.warn("Could not persist conversations:", (err as Error).message);
    }
  }

  list(): ConversationSummary[] {
    return Object.values(this.data)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }));
  }

  get(id: string): StoredConversation | undefined {
    return this.data[id];
  }

  save(id: string, messages: ChatMessageDTO[], title?: string) {
    const now = Date.now();
    const existing = this.data[id];
    this.data[id] = {
      id,
      title: title || existing?.title || deriveTitle(messages),
      messages,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.persist();
  }

  delete(id: string) {
    delete this.data[id];
    this.persist();
  }
}

function deriveTitle(messages: ChatMessageDTO[]): string {
  const first = messages.find((m) => m.role === "user");
  return (first?.content || "New chat").slice(0, 48);
}
