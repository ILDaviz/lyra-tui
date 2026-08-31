import { createGateway } from "ai";
import type { LanguageModel } from "ai";

export interface GatewayModelConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  headers?: Record<string, string>;
}

export const DEFAULT_GATEWAY_MODEL = "google/gemini-3.7-flash";

export function createGatewayModel(
  config: GatewayModelConfig = {},
): LanguageModel {
  const apiKey = config.apiKey || process.env.AI_GATEWAY_API_KEY;

  const gw = createGateway({
    apiKey,
    baseURL: config.baseURL,
    headers: config.headers,
  });

  const modelId = (config.model || DEFAULT_GATEWAY_MODEL) as any;
  return gw(modelId);
}
