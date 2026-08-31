import { createOllama } from "ollama-ai-provider-v2";
import type { LanguageModel } from "ai";

export interface OllamaModelConfig {
  baseURL?: string;
  model?: string;
  headers?: Record<string, string>;
}

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "llama3.3";

export function createOllamaModel(
  config: OllamaModelConfig = {},
): LanguageModel {
  const baseURL =
    config.baseURL || process.env.OLLAMA_URL || DEFAULT_OLLAMA_BASE_URL;

  const normalizedBaseUrl = baseURL.endsWith("/api")
    ? baseURL
    : `${baseURL.replace(/\/$/, "")}/api`;

  const ollama = createOllama({
    baseURL: normalizedBaseUrl,
    headers: config.headers,
  });

  const modelId =
    config.model || process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;

  return ollama(modelId) as unknown as LanguageModel;
}
