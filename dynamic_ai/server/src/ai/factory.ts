import type { Provider } from "@dyn/shared";
import type { AppConfig } from "../config";
import { createAnthropicProvider } from "./providers/anthropic";
import { createOpenAiProvider } from "./providers/openai";
import type { LlmProvider } from "./types";

export function createProvider(cfg: AppConfig, id: Provider): LlmProvider {
  if (id === "anthropic") {
    if (!cfg.anthropicApiKey) throw new Error("No Anthropic API key configured");
    return createAnthropicProvider(cfg.anthropicApiKey, cfg.textModel.anthropic);
  }
  if (!cfg.openaiApiKey) throw new Error("No OpenAI API key configured");
  return createOpenAiProvider(cfg.openaiApiKey, cfg.textModel.openai);
}
