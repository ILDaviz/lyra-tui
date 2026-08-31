import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export interface CustomOpenAICompatibleConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  headers?: Record<string, string>;
  name?: string;
}

export const DEFAULT_CUSTOM_MODEL = "gpt-5.6-luna";

export function createCustomModel(
  config: CustomOpenAICompatibleConfig = {},
): LanguageModel {
  const apiKey = config.apiKey || process.env.CUSTOM_AI_API_KEY || "dummy-key";

  const customProvider = createOpenAI({
    apiKey,
    baseURL: config.baseURL,
    headers: config.headers,
    name: config.name || "custom-ai",
  });

  const modelId = config.model || DEFAULT_CUSTOM_MODEL;
  return customProvider(modelId);
}
