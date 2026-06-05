import dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExposeMode, ExposureConfig, Provider, PublicSettings } from "@dyn/shared";

// Load .env from the repo root so `npm run dev -w @dyn/server` (whose working
// directory is server/) still finds it; also try the current directory.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config();

/**
 * The config layer. Auto-detects run mode:
 *  - "addon": running inside Home Assistant. SUPERVISOR_TOKEN is present; HA is
 *    reached through the Supervisor proxy; secrets come from /data/options.json.
 *  - "dev":   running locally. Secrets + HA URL/token come from .env.
 * (See PLAN.md §4.)
 */
export interface AppConfig {
  mode: "addon" | "dev";
  port: number;
  ha: { baseUrl: string; wsUrl: string; token: string | null };
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  defaultProvider: Provider;
  textModel: { openai: string; anthropic: string };
  voiceModel: string;
  voiceName: string;
  /** Force replies/speech into this language code (e.g. "nl"); "" = auto. */
  language: string;
  allowedDomains: string[];
  confirmDomains: string[];
  /** Initial exposure defaults (the runtime SettingsStore can override these). */
  exposeMode: ExposeMode;
  exposedEntities: string[];
  dataDir: string;
}

const DEFAULT_ALLOWED = [
  "light", "switch", "fan", "cover", "scene", "script",
  "media_player", "climate", "input_boolean", "automation",
];
const DEFAULT_CONFIRM = ["lock", "alarm_control_panel", "cover", "climate"];

function readAddonOptions(): Record<string, unknown> {
  try {
    if (existsSync("/data/options.json")) {
      return JSON.parse(readFileSync("/data/options.json", "utf8"));
    }
  } catch {
    /* ignore — fall back to defaults */
  }
  return {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const supervisorToken = process.env.SUPERVISOR_TOKEN;
  const isAddon = !!supervisorToken;
  const opts = isAddon ? readAddonOptions() : {};

  let ha: AppConfig["ha"];
  if (isAddon) {
    ha = {
      baseUrl: "http://supervisor/core",
      wsUrl: "ws://supervisor/core/websocket",
      token: supervisorToken!,
    };
  } else {
    const baseUrl = (process.env.HA_URL || "http://homeassistant.local:8123").replace(/\/+$/, "");
    ha = {
      baseUrl,
      wsUrl: baseUrl.replace(/^http/, "ws") + "/api/websocket",
      token: str(process.env.HA_TOKEN),
    };
  }

  const allowed = (Array.isArray(opts.allowed_domains) ? (opts.allowed_domains as string[]) : null) ?? DEFAULT_ALLOWED;
  const confirm = (Array.isArray(opts.confirm_domains) ? (opts.confirm_domains as string[]) : null) ?? DEFAULT_CONFIRM;
  const exposeMode = ((isAddon ? str(opts.expose_mode) : str(process.env.EXPOSE_MODE)) as ExposeMode) === "list" ? "list" : "all";
  const exposedEntities =
    (Array.isArray(opts.exposed_entities) ? (opts.exposed_entities as string[]) : null) ??
    (process.env.EXPOSED_ENTITIES ? process.env.EXPOSED_ENTITIES.split(",").map((s) => s.trim()).filter(Boolean) : []);

  cached = {
    mode: isAddon ? "addon" : "dev",
    port: Number(process.env.PORT || 8099),
    ha,
    openaiApiKey: isAddon ? str(opts.openai_api_key) : str(process.env.OPENAI_API_KEY),
    anthropicApiKey: isAddon ? str(opts.anthropic_api_key) : str(process.env.ANTHROPIC_API_KEY),
    defaultProvider: ((isAddon ? str(opts.default_text_provider) : str(process.env.DEFAULT_TEXT_PROVIDER)) as Provider) || "openai",
    textModel: {
      openai: process.env.OPENAI_TEXT_MODEL || "gpt-5.5",
      anthropic: process.env.ANTHROPIC_TEXT_MODEL || "claude-sonnet-4-6",
    },
    voiceModel: (isAddon ? str(opts.voice_model) : str(process.env.VOICE_MODEL)) || "gpt-realtime-2",
    voiceName: (isAddon ? str(opts.voice_name) : str(process.env.VOICE_NAME)) || "marin",
    language: (isAddon ? str(opts.language) : str(process.env.LANGUAGE)) || "",
    allowedDomains: allowed,
    confirmDomains: confirm,
    exposeMode,
    exposedEntities,
    dataDir: isAddon ? "/data" : path.resolve(process.cwd(), "data"),
  };
  return cached;
}

/** Resolve which text provider to use given a request preference + configured keys. */
export function resolveProvider(cfg: AppConfig, requested?: Provider): Provider | null {
  const have = { openai: !!cfg.openaiApiKey, anthropic: !!cfg.anthropicApiKey };
  if (requested && have[requested]) return requested;
  if (have[cfg.defaultProvider]) return cfg.defaultProvider;
  if (have.openai) return "openai";
  if (have.anthropic) return "anthropic";
  return null;
}

export function getPublicSettings(cfg: AppConfig, haConnected: boolean, exposure: ExposureConfig): PublicSettings {
  return {
    defaultProvider: cfg.defaultProvider,
    providers: { openai: !!cfg.openaiApiKey, anthropic: !!cfg.anthropicApiKey },
    voiceEnabled: !!cfg.openaiApiKey,
    voiceModel: cfg.voiceModel,
    allowedDomains: cfg.allowedDomains,
    confirmDomains: cfg.confirmDomains,
    exposeMode: exposure.mode,
    exposedCount: exposure.mode === "list" ? exposure.entities.length : null,
    mode: cfg.mode,
    haConnected,
  };
}
