import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export interface OpenAIModelConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  headers?: Record<string, string>;
}

export const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";

export function createOpenAIModel(
  config: OpenAIModelConfig = {},
): LanguageModel {
  const apiKey =
    config.apiKey || process.env.OPENAI_API_KEY || process.env.OPENAI_TOKEN;

  const openai = createOpenAI({
    apiKey,
    baseURL: config.baseURL,
    headers: config.headers,
  });

  const modelId = config.model || DEFAULT_OPENAI_MODEL;
  return openai(modelId);
}
