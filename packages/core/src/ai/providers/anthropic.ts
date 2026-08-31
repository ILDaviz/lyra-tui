import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export interface AnthropicModelConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  headers?: Record<string, string>;
}

export const DEFAULT_ANTHROPIC_MODEL = "claude-3-7-sonnet-latest";

export function createAnthropicModel(
  config: AnthropicModelConfig = {},
): LanguageModel {
  const apiKey =
    config.apiKey ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN;

  const anthropic = createAnthropic({
    apiKey,
    baseURL: config.baseURL,
    headers: config.headers,
  });

  const modelId = config.model || DEFAULT_ANTHROPIC_MODEL;
  return anthropic(modelId);
}
