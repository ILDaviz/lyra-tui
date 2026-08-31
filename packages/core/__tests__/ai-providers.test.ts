import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SUPPORTED_AI_PROVIDERS,
  getDefaultModel,
  detectProvider,
  hasConfiguredProvider,
  resolveAiModel,
  getLanguageModel,
  createOpenAIModel,
  createAnthropicModel,
  createGoogleModel,
  createOllamaModel,
  createCustomModel,
  createGatewayModel,
} from "../src/ai";
import { resetServices, saveConfig } from "../src/helpers";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("AI Providers and Factory", () => {
  let testRepoPath = "";
  let originalRepoPathEnv: string | undefined;

  beforeEach(async () => {
    testRepoPath = await fs.mkdtemp(path.join(os.tmpdir(), "lyra-ai-test-"));
    originalRepoPathEnv = process.env.LYRA_REPO_PATH;
    process.env.LYRA_REPO_PATH = testRepoPath;
    resetServices();
  });

  afterEach(async () => {
    if (originalRepoPathEnv === undefined) {
      delete process.env.LYRA_REPO_PATH;
    } else {
      process.env.LYRA_REPO_PATH = originalRepoPathEnv;
    }
    resetServices();
    await fs.rm(testRepoPath, { recursive: true, force: true }).catch(() => {});
  });

  it("lists all supported providers and their default models", () => {
    expect(SUPPORTED_AI_PROVIDERS).toEqual([
      "openai",
      "anthropic",
      "google",
      "ollama",
      "custom",
      "gateway",
    ]);

    expect(getDefaultModel("openai")).toBe("gpt-5.6-luna");
    expect(getDefaultModel("anthropic")).toBe("claude-3-7-sonnet-latest");
    expect(getDefaultModel("google")).toBe("gemini-3.7-flash");
    expect(getDefaultModel("ollama")).toBe("llama3.3");
    expect(getDefaultModel("custom")).toBe("gpt-5.6-luna");
    expect(getDefaultModel("gateway")).toBe("google/gemini-3.7-flash");
  });

  it("detects provider from options or credentials", async () => {
    expect(detectProvider({ provider: "anthropic" })).toBe("anthropic");
    expect(detectProvider({ provider: "google" })).toBe("google");
    expect(detectProvider({ provider: "ollama" })).toBe("ollama");

    expect(detectProvider({ anthropicApiKey: "test-key" })).toBe("anthropic");
    expect(detectProvider({ googleApiKey: "test-key" })).toBe("google");
    expect(detectProvider({ ollamaUrl: "http://localhost:11434" })).toBe(
      "ollama",
    );
    expect(
      detectProvider({
        customApiKey: "test-key",
        customBaseUrl: "http://api.test",
      }),
    ).toBe("custom");
    expect(detectProvider({ aiGatewayKey: "gw-key" })).toBe("gateway");
    expect(detectProvider({ token: "sk-openai" })).toBe("openai");

    await saveConfig({ aiProvider: "google" });
    expect(detectProvider({})).toBe("google");
  });

  it("checks whether a provider is properly configured", async () => {
    expect(hasConfiguredProvider({ provider: "openai" })).toBe(false);
    expect(
      hasConfiguredProvider({ provider: "openai", token: "sk-test" }),
    ).toBe(true);
    expect(
      hasConfiguredProvider({
        provider: "anthropic",
        anthropicApiKey: "ant-key",
      }),
    ).toBe(true);
    expect(
      hasConfiguredProvider({ provider: "google", googleApiKey: "g-key" }),
    ).toBe(true);
    expect(
      hasConfiguredProvider({
        provider: "ollama",
        ollamaUrl: "http://localhost:11434",
      }),
    ).toBe(true);

    await saveConfig({ openaiToken: "sk-saved" });
    expect(hasConfiguredProvider({ provider: "openai" })).toBe(true);
  });

  it("resolves language models with defaults and overrides", () => {
    const openaiResolved = resolveAiModel({
      provider: "openai",
      token: "sk-test",
    });
    expect(openaiResolved.provider).toBe("openai");
    expect(openaiResolved.modelName).toBe("gpt-5.6-luna");
    expect(openaiResolved.model).toBeDefined();

    const anthropicResolved = resolveAiModel({
      provider: "anthropic",
      anthropicApiKey: "sk-ant",
      aiModel: "claude-3-haiku-20240307",
    });
    expect(anthropicResolved.provider).toBe("anthropic");
    expect(anthropicResolved.modelName).toBe("claude-3-haiku-20240307");
    expect(anthropicResolved.model).toBeDefined();

    const googleResolved = resolveAiModel({
      provider: "google",
      googleApiKey: "gem-key",
      model: "gemini-2.0-flash",
    });
    expect(googleResolved.provider).toBe("google");
    expect(googleResolved.modelName).toBe("gemini-2.0-flash");

    const ollamaResolved = resolveAiModel({
      provider: "ollama",
      ollamaModel: "mistral",
    });
    expect(ollamaResolved.provider).toBe("ollama");
    expect(ollamaResolved.modelName).toBe("mistral");

    const customResolved = resolveAiModel({
      provider: "custom",
      customApiKey: "sk-custom",
      customBaseUrl: "https://my-llm.org/v1",
      aiModel: "custom-llama",
    });
    expect(customResolved.provider).toBe("custom");
    expect(customResolved.modelName).toBe("custom-llama");

    const gwResolved = resolveAiModel({
      provider: "gateway",
      aiGatewayKey: "gw-key",
      aiModel: "anthropic/claude-3-5-sonnet-latest",
    });
    expect(gwResolved.provider).toBe("gateway");
    expect(gwResolved.modelName).toBe("anthropic/claude-3-5-sonnet-latest");
  });

  it("instantiates provider models via direct helper functions", () => {
    expect(
      createOpenAIModel({ apiKey: "sk-test", model: "gpt-4o" }),
    ).toBeDefined();
    expect(createAnthropicModel({ apiKey: "sk-test" })).toBeDefined();
    expect(createGoogleModel({ apiKey: "sk-test" })).toBeDefined();
    expect(
      createOllamaModel({ baseURL: "http://localhost:11434" }),
    ).toBeDefined();
    expect(
      createCustomModel({
        apiKey: "test",
        baseURL: "http://localhost:8000/v1",
      }),
    ).toBeDefined();
    expect(createGatewayModel({ apiKey: "gw-test" })).toBeDefined();
    expect(
      getLanguageModel({ provider: "openai", token: "test" }),
    ).toBeDefined();
  });
});
