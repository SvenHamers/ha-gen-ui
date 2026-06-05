import type { ActionRef, ChatRequest, EntityInfo, ExposureConfig, PublicSettings, ServerEvent } from "@dyn/shared";

/**
 * Resolve an API path against the document base. This makes everything work
 * both at http://localhost:8099/ (dev) and under the Home Assistant Ingress
 * path prefix (…/api/hassio_ingress/<token>/), where the document is served
 * with a trailing slash.
 */
export function apiUrl(path: string): string {
  const base = document.baseURI.endsWith("/") ? document.baseURI : document.baseURI + "/";
  return new URL(path.replace(/^\//, ""), base).toString();
}

export async function fetchSettings(): Promise<PublicSettings> {
  const r = await fetch(apiUrl("api/settings"));
  if (!r.ok) throw new Error("Failed to load settings");
  return r.json();
}

/** POST the conversation and stream typed events back (SSE over fetch). */
export async function streamChat(req: ChatRequest, onEvent: (ev: ServerEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(apiUrl("api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Chat request failed (${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of block.split("\n")) {
        if (line.startsWith("data:")) {
          const json = line.slice(5).trim();
          if (json) {
            try {
              onEvent(JSON.parse(json) as ServerEvent);
            } catch {
              /* ignore malformed frame */
            }
          }
        }
      }
    }
  }
}

export interface ActionResult {
  ok: boolean;
  message?: string;
  error?: string;
  state?: { entity_id: string; state: string };
}

export async function runAction(action: ActionRef): Promise<ActionResult> {
  try {
    const r = await fetch(apiUrl("api/action"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    return r.json();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  try {
    const r = await fetch(apiUrl("api/conversations"));
    return r.ok ? r.json() : [];
  } catch {
    return [];
  }
}

export async function getConversation(
  id: string,
): Promise<{ id: string; title: string; messages: { role: "user" | "assistant"; content: string }[] } | null> {
  try {
    const r = await fetch(apiUrl(`api/conversations/${id}`));
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

export async function deleteConversation(id: string): Promise<void> {
  try {
    await fetch(apiUrl(`api/conversations/${id}`), { method: "DELETE" });
  } catch {
    /* ignore */
  }
}

export async function getEntities(): Promise<EntityInfo[]> {
  try {
    const r = await fetch(apiUrl("api/entities"));
    return r.ok ? r.json() : [];
  } catch {
    return [];
  }
}

export async function getExposure(): Promise<ExposureConfig> {
  const r = await fetch(apiUrl("api/exposure"));
  return r.json();
}

export async function setExposure(cfg: ExposureConfig): Promise<ExposureConfig> {
  const r = await fetch(apiUrl("api/exposure"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  return r.json();
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
