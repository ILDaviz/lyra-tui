import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  setSecretStoreExecutorForTests,
  resetSecretStoreForTests,
  setSecret,
  getSecret,
  deleteSecret,
  SecretCommandResult,
} from "../src/secret-store";
import { getConfig, saveConfig, resetServices } from "../src/helpers";

function createMockKeychain(options?: { failStore?: boolean }) {
  const store = new Map<string, string>();
  const keyFromSecurityArgs = (args: string[]) =>
    args[args.indexOf("-a") + 1];
  const keyFromSecretToolArgs = (args: string[]) =>
    args[args.indexOf("account") + 1];

  const executor = (
    _command: string,
    args: string[],
    input?: string,
  ): SecretCommandResult => {
    const verb = args[0];
    if (verb === "add-generic-password" || verb === "store") {
      if (options?.failStore) {
        return { status: 1, stdout: "", stderr: "store failed" };
      }
      const key =
        verb === "add-generic-password"
          ? keyFromSecurityArgs(args)
          : keyFromSecretToolArgs(args);
      store.set(key, input ?? "");
      return { status: 0, stdout: "", stderr: "" };
    }
    if (verb === "find-generic-password" || verb === "lookup") {
      const key =
        verb === "find-generic-password"
          ? keyFromSecurityArgs(args)
          : keyFromSecretToolArgs(args);
      const value = store.get(key);
      if (value === undefined) {
        return { status: 44, stdout: "", stderr: "item not found" };
      }
      return { status: 0, stdout: `${value}\n`, stderr: "" };
    }
    if (verb === "delete-generic-password" || verb === "clear") {
      const key =
        verb === "delete-generic-password"
          ? keyFromSecurityArgs(args)
          : keyFromSecretToolArgs(args);
      store.delete(key);
      return { status: 0, stdout: "", stderr: "" };
    }
    return { status: 1, stdout: "", stderr: `unexpected verb: ${verb}` };
  };

  return { store, executor };
}

describe("secret-store", () => {
  afterEach(() => {
    resetSecretStoreForTests();
  });

  it("stores and retrieves a secret", () => {
    const mock = createMockKeychain();
    setSecretStoreExecutorForTests(mock.executor);

    expect(setSecret("OPENAI_TOKEN", "sk-test-secret")).toBe(true);
    expect(getSecret("OPENAI_TOKEN")).toBe("sk-test-secret");
  });

  it("returns null for a missing secret", () => {
    const mock = createMockKeychain();
    setSecretStoreExecutorForTests(mock.executor);

    expect(getSecret("OPENAI_TOKEN")).toBeNull();
  });

  it("deletes a secret", () => {
    const mock = createMockKeychain();
    setSecretStoreExecutorForTests(mock.executor);

    setSecret("ANTHROPIC_API_KEY", "sk-ant-secret");
    expect(getSecret("ANTHROPIC_API_KEY")).toBe("sk-ant-secret");

    deleteSecret("ANTHROPIC_API_KEY");
    expect(getSecret("ANTHROPIC_API_KEY")).toBeNull();
  });

  it("reports failure when the store cannot write", () => {
    const mock = createMockKeychain({ failStore: true });
    setSecretStoreExecutorForTests(mock.executor);

    expect(setSecret("OPENAI_TOKEN", "sk-test-secret")).toBe(false);
    expect(getSecret("OPENAI_TOKEN")).toBeNull();
  });
});

describe("keychain-backed config secrets", () => {
  let testRepoPath = "";
  let originalRepoPathEnv: string | undefined;

  beforeEach(async () => {
    testRepoPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "lyra-secret-store-test-"),
    );
    originalRepoPathEnv = process.env.LYRA_REPO_PATH;
    process.env.LYRA_REPO_PATH = testRepoPath;
    resetServices();
    setSecretStoreExecutorForTests(createMockKeychain().executor);
  });

  afterEach(async () => {
    resetSecretStoreForTests();
    if (originalRepoPathEnv === undefined) {
      delete process.env.LYRA_REPO_PATH;
    } else {
      process.env.LYRA_REPO_PATH = originalRepoPathEnv;
    }
    resetServices();
    await fs.rm(testRepoPath, { recursive: true, force: true }).catch(() => {});
  });

  it("stores secrets in the keychain and keeps them out of .env", async () => {
    await saveConfig({ useKeychain: true, openaiToken: "sk-vault-secret" });

    const envContent = await fs.readFile(
      path.join(testRepoPath, ".env"),
      "utf-8",
    );
    expect(envContent).not.toContain("OPENAI_TOKEN=");

    const configJson = JSON.parse(
      await fs.readFile(path.join(testRepoPath, "config.json"), "utf-8"),
    );
    expect(configJson.useKeychain).toBe(true);
    expect(configJson.openaiToken).toBeUndefined();
  });

  it("loads secrets back from the keychain after reload", async () => {
    await saveConfig({ useKeychain: true, openaiToken: "sk-vault-secret" });

    resetServices();
    const config = getConfig();
    expect(config.openaiToken).toBe("sk-vault-secret");
  });

  it("migrates existing .env secrets into the keychain on save", async () => {
    await fs.writeFile(
      path.join(testRepoPath, ".env"),
      "OPENAI_TOKEN=sk-legacy-secret\n",
      "utf-8",
    );
    expect(getConfig().openaiToken).toBe("sk-legacy-secret");

    await saveConfig({ useKeychain: true });

    const envContent = await fs.readFile(
      path.join(testRepoPath, ".env"),
      "utf-8",
    );
    expect(envContent).not.toContain("OPENAI_TOKEN=");

    resetServices();
    expect(getConfig().openaiToken).toBe("sk-legacy-secret");
  });

  it("falls back to .env when the keychain write fails", async () => {
    setSecretStoreExecutorForTests(
      createMockKeychain({ failStore: true }).executor,
    );

    await saveConfig({ useKeychain: true, openaiToken: "sk-fallback" });

    const envContent = await fs.readFile(
      path.join(testRepoPath, ".env"),
      "utf-8",
    );
    expect(envContent).toContain("OPENAI_TOKEN=sk-fallback");

    resetServices();
    expect(getConfig().openaiToken).toBe("sk-fallback");
  });

  it("keeps writing secrets to .env when useKeychain is disabled", async () => {
    await saveConfig({ openaiToken: "sk-plain-secret" });

    const envContent = await fs.readFile(
      path.join(testRepoPath, ".env"),
      "utf-8",
    );
    expect(envContent).toContain("OPENAI_TOKEN=sk-plain-secret");
    expect(getConfig().openaiToken).toBe("sk-plain-secret");
  });
});
