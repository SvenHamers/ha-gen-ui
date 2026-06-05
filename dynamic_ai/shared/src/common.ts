// Shared DTOs and small types used across the wire (no secrets here).

export type Provider = "openai" | "anthropic";

/** Whether the assistant can see/control all entities, or only a chosen list. */
export type ExposeMode = "all" | "list";

export interface ExposureConfig {
  mode: ExposeMode;
  /** entity_ids and/or glob patterns (e.g. "light.*", "sensor.*_battery"). */
  entities: string[];
}

/** Compact entity descriptor for the exposure picker. */
export interface EntityInfo {
  entity_id: string;
  name: string;
  domain: string;
  state: string;
  exposed: boolean;
}

export interface ChatMessageDTO {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessageDTO[];
  provider?: Provider;
  conversationId?: string;
}

/** Settings safe to expose to the browser — never includes raw keys. */
export interface PublicSettings {
  defaultProvider: Provider;
  /** Which providers have a key configured. */
  providers: { openai: boolean; anthropic: boolean };
  voiceEnabled: boolean;
  voiceModel: string;
  allowedDomains: string[];
  confirmDomains: string[];
  /** "all" → every entity is exposed; "list" → only the chosen ones. */
  exposeMode: ExposeMode;
  /** Number of exposure rules when mode === "list" (null when "all"). */
  exposedCount: number | null;
  /** "addon" when running inside Home Assistant, "dev" when run locally. */
  mode: "addon" | "dev";
  haConnected: boolean;
}
