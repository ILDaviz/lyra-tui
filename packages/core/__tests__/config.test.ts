import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { getConfig, saveConfig, resetServices } from "../src/helpers";

describe("Config & secrets storage", () => {
  let testRepoPath = "";
  let originalRepoPathEnv: string | undefined;

  beforeEach(async () => {
    testRepoPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "lyra-config-test-"),
    );
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

  it("writes settings to config.json and secrets to .env", async () => {
    await saveConfig({
      autoSyncEnabled: true,
      language: "it",
      openaiToken: "sk-test-secret",
      ollamaUrl: "http://localhost:11434",
    });

    const configJson = JSON.parse(
      await fs.readFile(path.join(testRepoPath, "config.json"), "utf-8"),
    );
    expect(configJson.autoSyncEnabled).toBe(true);
    expect(configJson.language).toBe("it");
    expect(configJson.openaiToken).toBeUndefined();
    expect(configJson.ollamaUrl).toBeUndefined();

    const envContent = await fs.readFile(
      path.join(testRepoPath, ".env"),
      "utf-8",
    );
    expect(envContent).toContain("OPENAI_TOKEN=sk-test-secret");
    expect(envContent).toContain("OLLAMA_URL=http://localhost:11434");
  });

  it("gitignores the .env file when secrets are saved", async () => {
    await saveConfig({ openaiToken: "sk-test-secret" });

    const gitignore = await fs.readFile(
      path.join(testRepoPath, ".gitignore"),
      "utf-8",
    );
    expect(gitignore.split("\n").map((l) => l.trim())).toContain(".env");
  });

  it("loads secrets from .env with precedence over config.json", async () => {
    await fs.writeFile(
      path.join(testRepoPath, "config.json"),
      JSON.stringify({ openaiToken: "sk-from-config", autoSyncEnabled: true }),
      "utf-8",
    );
    await fs.writeFile(
      path.join(testRepoPath, ".env"),
      "OPENAI_TOKEN=sk-from-env\n",
      "utf-8",
    );

    const config = getConfig();
    expect(config.openaiToken).toBe("sk-from-env");
    expect(config.autoSyncEnabled).toBe(true);
  });

  it("preserves unrelated variables already present in .env", async () => {
    await fs.writeFile(
      path.join(testRepoPath, ".env"),
      "OTHER_VAR=keepme\n",
      "utf-8",
    );

    await saveConfig({ openaiToken: "sk-test-secret" });

    const envContent = await fs.readFile(
      path.join(testRepoPath, ".env"),
      "utf-8",
    );
    expect(envContent).toContain("OTHER_VAR=keepme");
    expect(envContent).toContain("OPENAI_TOKEN=sk-test-secret");
  });

  it("removes managed secrets when their configured value is cleared", async () => {
    await fs.writeFile(
      path.join(testRepoPath, ".env"),
      "OPENAI_TOKEN=old-secret\nOTHER_VAR=keepme\n",
      "utf-8",
    );

    await saveConfig({ openaiToken: "" });

    const envContent = await fs.readFile(
      path.join(testRepoPath, ".env"),
      "utf-8",
    );
    expect(envContent).not.toContain("OPENAI_TOKEN=");
    expect(envContent).toContain("OTHER_VAR=keepme");
  });

  it("loads CUSTOM_BASE_URL from .env without storing it as a secret", async () => {
    await fs.writeFile(
      path.join(testRepoPath, ".env"),
      "CUSTOM_BASE_URL=https://custom.example/v1\n",
      "utf-8",
    );

    expect(getConfig().customBaseUrl).toBe("https://custom.example/v1");
  });

  it("handles multi-provider configuration and secrets properly", async () => {
    await saveConfig({
      aiProvider: "anthropic",
      aiModel: "claude-3-5-sonnet-latest",
      anthropicApiKey: "sk-ant-test-key",
      googleApiKey: "gm-test-key",
      customApiKey: "custom-key",
      customBaseUrl: "https://custom.ai.com/v1",
      aiGatewayKey: "gw-key",
    });

    const configJson = JSON.parse(
      await fs.readFile(path.join(testRepoPath, "config.json"), "utf-8"),
    );
    expect(configJson.aiProvider).toBe("anthropic");
    expect(configJson.aiModel).toBe("claude-3-5-sonnet-latest");
    expect(configJson.customBaseUrl).toBe("https://custom.ai.com/v1");
    expect(configJson.anthropicApiKey).toBeUndefined();
    expect(configJson.googleApiKey).toBeUndefined();
    expect(configJson.customApiKey).toBeUndefined();
    expect(configJson.aiGatewayKey).toBeUndefined();

    const envContent = await fs.readFile(
      path.join(testRepoPath, ".env"),
      "utf-8",
    );
    expect(envContent).toContain("ANTHROPIC_API_KEY=sk-ant-test-key");
    expect(envContent).toContain("GOOGLE_API_KEY=gm-test-key");
    expect(envContent).toContain("CUSTOM_AI_API_KEY=custom-key");
    expect(envContent).toContain("AI_GATEWAY_API_KEY=gw-key");

    resetServices();
    const config = getConfig();
    expect(config.aiProvider).toBe("anthropic");
    expect(config.aiModel).toBe("claude-3-5-sonnet-latest");
    expect(config.anthropicApiKey).toBe("sk-ant-test-key");
    expect(config.googleApiKey).toBe("gm-test-key");
    expect(config.customApiKey).toBe("custom-key");
    expect(config.aiGatewayKey).toBe("gw-key");
  });
});
