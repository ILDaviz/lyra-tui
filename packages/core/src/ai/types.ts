import type { LanguageModel } from "ai";

export type AiProviderType =
  "openai" | "anthropic" | "google" | "ollama" | "custom" | "gateway";

export interface AiModelOptions {
  provider?: AiProviderType;
  model?: string;
  aiModel?: string;
  token?: string;
  apiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  customApiKey?: string;
  customBaseUrl?: string;
  aiGatewayKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  temperature?: number;
  ollamaUrl?: string;
  ollamaModel?: string;
}

export interface ResolvedAiModel {
  provider: AiProviderType;
  model: LanguageModel;
  modelName: string;
}

export type { LanguageModel };
