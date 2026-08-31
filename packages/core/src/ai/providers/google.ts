import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export interface GoogleModelConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  headers?: Record<string, string>;
}

export const DEFAULT_GOOGLE_MODEL = "gemini-3.7-flash";

export function createGoogleModel(
  config: GoogleModelConfig = {},
): LanguageModel {
  const apiKey =
    config.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

  const google = createGoogleGenerativeAI({
    apiKey,
    baseURL: config.baseURL,
    headers: config.headers,
  });

  const modelId = config.model || DEFAULT_GOOGLE_MODEL;
  return google(modelId);
}
