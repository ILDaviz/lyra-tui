import type { LanguageModel } from "ai";
import { getConfig } from "../helpers";
import type { RagOptions } from "../types";
import type { AiModelOptions, AiProviderType, ResolvedAiModel } from "./types";
import { createOpenAIModel, DEFAULT_OPENAI_MODEL } from "./providers/openai";
import {
  createAnthropicModel,
  DEFAULT_ANTHROPIC_MODEL,
} from "./providers/anthropic";
import { createGoogleModel, DEFAULT_GOOGLE_MODEL } from "./providers/google";
import {
  createOllamaModel,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
} from "./providers/ollama";
import { createCustomModel, DEFAULT_CUSTOM_MODEL } from "./providers/custom";
import { createGatewayModel, DEFAULT_GATEWAY_MODEL } from "./providers/gateway";

export const SUPPORTED_AI_PROVIDERS: AiProviderType[] = [
  "openai",
  "anthropic",
  "google",
  "ollama",
  "custom",
  "gateway",
];

export function getDefaultModel(provider: AiProviderType): string {
  switch (provider) {
    case "openai":
      return DEFAULT_OPENAI_MODEL;
    case "anthropic":
      return DEFAULT_ANTHROPIC_MODEL;
    case "google":
      return DEFAULT_GOOGLE_MODEL;
    case "ollama":
      return DEFAULT_OLLAMA_MODEL;
    case "custom":
      return DEFAULT_CUSTOM_MODEL;
    case "gateway":
      return DEFAULT_GATEWAY_MODEL;
    default:
      return DEFAULT_OPENAI_MODEL;
  }
}

export function detectProvider(
  options?: RagOptions | AiModelOptions,
): AiProviderType {
  if (options?.provider) {
    return options.provider as AiProviderType;
  }

  const config = getConfig();
  if (config.aiProvider) {
    return config.aiProvider;
  }

  if (
    options?.anthropicApiKey ||
    config.anthropicApiKey ||
    process.env.ANTHROPIC_API_KEY
  ) {
    return "anthropic";
  }
  if (
    options?.googleApiKey ||
    config.googleApiKey ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY
  ) {
    return "google";
  }
  if (
    options?.customApiKey ||
    options?.customBaseUrl ||
    config.customApiKey ||
    config.customBaseUrl
  ) {
    return "custom";
  }
  if (
    options?.aiGatewayKey ||
    config.aiGatewayKey ||
    process.env.AI_GATEWAY_API_KEY
  ) {
    return "gateway";
  }
  if (
    options?.ollamaUrl ||
    options?.ollamaModel ||
    config.ollamaUrl ||
    config.ollamaModel
  ) {
    return "ollama";
  }
  if (
    options?.token ||
    options?.apiKey ||
    config.openaiApiKey ||
    config.openaiToken ||
    process.env.OPENAI_API_KEY
  ) {
    return "openai";
  }

  return "openai";
}

export function hasConfiguredProvider(
  options?: RagOptions | AiModelOptions,
): boolean {
  const provider = detectProvider(options);
  const config = getConfig();

  switch (provider) {
    case "openai": {
      const token =
        options?.apiKey ||
        options?.token ||
        config.openaiApiKey ||
        config.openaiToken ||
        process.env.OPENAI_API_KEY ||
        process.env.OPENAI_TOKEN;
      return !!token;
    }
    case "anthropic": {
      const key =
        options?.anthropicApiKey ||
        options?.apiKey ||
        options?.token ||
        config.anthropicApiKey ||
        process.env.ANTHROPIC_API_KEY ||
        process.env.ANTHROPIC_AUTH_TOKEN;
      return !!key;
    }
    case "google": {
      const key =
        options?.googleApiKey ||
        options?.apiKey ||
        options?.token ||
        config.googleApiKey ||
        process.env.GOOGLE_API_KEY ||
        process.env.GEMINI_API_KEY;
      return !!key;
    }
    case "ollama": {
      return !!(
        options?.ollamaUrl ||
        options?.ollamaModel ||
        config.ollamaUrl ||
        config.ollamaModel ||
        process.env.OLLAMA_URL ||
        process.env.OLLAMA_MODEL
      );
    }
    case "custom": {
      return !!(
        options?.customBaseUrl ||
        options?.customApiKey ||
        options?.baseURL ||
        options?.apiKey ||
        config.customBaseUrl ||
        config.customApiKey
      );
    }
    case "gateway": {
      return !!(
        options?.aiGatewayKey ||
        options?.apiKey ||
        config.aiGatewayKey ||
        process.env.AI_GATEWAY_API_KEY
      );
    }
    default:
      return false;
  }
}

export function resolveAiModel(
  options?: RagOptions | AiModelOptions,
): ResolvedAiModel {
  const provider = detectProvider(options);
  const config = getConfig();

  const userModel =
    options?.aiModel ||
    options?.model ||
    options?.ollamaModel ||
    config.aiModel ||
    (provider === "ollama" ? config.ollamaModel : undefined);

  const modelName = userModel || getDefaultModel(provider);

  switch (provider) {
    case "openai": {
      const apiKey =
        options?.apiKey ||
        options?.token ||
        config.openaiApiKey ||
        config.openaiToken ||
        process.env.OPENAI_API_KEY ||
        process.env.OPENAI_TOKEN;

      const model = createOpenAIModel({
        apiKey,
        baseURL: options?.baseURL,
        model: modelName,
        headers: options?.headers,
      });
      return { provider, model, modelName };
    }

    case "anthropic": {
      const apiKey =
        options?.anthropicApiKey ||
        options?.apiKey ||
        options?.token ||
        config.anthropicApiKey ||
        process.env.ANTHROPIC_API_KEY ||
        process.env.ANTHROPIC_AUTH_TOKEN;

      const model = createAnthropicModel({
        apiKey,
        baseURL: options?.baseURL,
        model: modelName,
        headers: options?.headers,
      });
      return { provider, model, modelName };
    }

    case "google": {
      const apiKey =
        options?.googleApiKey ||
        options?.apiKey ||
        options?.token ||
        config.googleApiKey ||
        process.env.GOOGLE_API_KEY ||
        process.env.GEMINI_API_KEY;

      const model = createGoogleModel({
        apiKey,
        baseURL: options?.baseURL,
        model: modelName,
        headers: options?.headers,
      });
      return { provider, model, modelName };
    }

    case "ollama": {
      const baseURL =
        options?.ollamaUrl ||
        options?.baseURL ||
        config.ollamaUrl ||
        process.env.OLLAMA_URL ||
        DEFAULT_OLLAMA_BASE_URL;

      const model = createOllamaModel({
        baseURL,
        model: modelName,
        headers: options?.headers,
      });
      return { provider, model, modelName };
    }

    case "custom": {
      const apiKey =
        options?.customApiKey ||
        options?.apiKey ||
        options?.token ||
        config.customApiKey;

      const baseURL =
        options?.customBaseUrl || options?.baseURL || config.customBaseUrl;

      const model = createCustomModel({
        apiKey,
        baseURL,
        model: modelName,
        headers: options?.headers,
      });
      return { provider, model, modelName };
    }

    case "gateway": {
      const apiKey =
        options?.aiGatewayKey ||
        options?.apiKey ||
        config.aiGatewayKey ||
        process.env.AI_GATEWAY_API_KEY;

      const model = createGatewayModel({
        apiKey,
        baseURL: options?.baseURL,
        model: modelName,
        headers: options?.headers,
      });
      return { provider, model, modelName };
    }

    default: {
      const model = createOpenAIModel({ model: modelName });
      return { provider: "openai", model, modelName };
    }
  }
}

export function getLanguageModel(
  options?: RagOptions | AiModelOptions,
): LanguageModel {
  return resolveAiModel(options).model;
}
