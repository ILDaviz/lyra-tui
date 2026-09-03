import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import { GitService } from "./git-service";
import { EmbeddingService } from "./services";
import { getSecret, isKeychainAvailable, setSecret } from "./secret-store";
import { AppConfig } from "./types";

let gitService: GitService | null = null;
let embeddingService: EmbeddingService | null = null;
let customRepoPath: string | null = null;
let appConfig: AppConfig = {
  autoSyncEnabled: false,
  autoSyncIntervalMins: 5,
};
let configLoaded = false;

const SECRET_ENV_KEYS: Record<string, keyof AppConfig> = {
  OPENAI_TOKEN: "openaiToken",
  OPENAI_API_KEY: "openaiApiKey",
  ANTHROPIC_API_KEY: "anthropicApiKey",
  GOOGLE_API_KEY: "googleApiKey",
  GEMINI_API_KEY: "googleApiKey",
  CUSTOM_AI_API_KEY: "customApiKey",
  AI_GATEWAY_API_KEY: "aiGatewayKey",
  OLLAMA_URL: "ollamaUrl",
  OLLAMA_MODEL: "ollamaModel",
};
const ENV_CONFIG_KEYS: Record<string, keyof AppConfig> = {
  ...SECRET_ENV_KEYS,
  CUSTOM_BASE_URL: "customBaseUrl",
};
const SECRET_CONFIG_KEYS = new Set<keyof AppConfig>(
  Object.values(SECRET_ENV_KEYS),
);

export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

const NODE_ENV_KEY = ["NODE", "ENV"].join("_");

function getRawNodeEnv(): string | undefined {
  return process.env[NODE_ENV_KEY];
}

function setRawNodeEnv(val: string): void {
  process.env[NODE_ENV_KEY] = val;
}

export function getNodeEnv(): string {
  const envVal = getRawNodeEnv();
  if (envVal === "develop") return "development";
  return envVal || "production";
}

export function initEnvironment(cwd: string = process.cwd()): string {
  if (!getRawNodeEnv()) {
    const envPath = path.join(cwd, ".env");
    if (fsSync.existsSync(envPath)) {
      try {
        const envVars = parseEnvFile(fsSync.readFileSync(envPath, "utf-8"));
        if (envVars.NODE_ENV) {
          setRawNodeEnv(envVars.NODE_ENV);
        }
      } catch {}
    }
  }

  const current = getRawNodeEnv();
  if (current === "develop") {
    setRawNodeEnv("development");
  } else if (!current) {
    setRawNodeEnv("production");
  }

  return getRawNodeEnv()!;
}

export function captureException(err: any): void {
  const env = getNodeEnv();
  if (env === "development" || env === "develop") {
    console.error("[Error Captured]:", err);
  }
}

export function getDefaultRepoPath(): string {
  if (process.env.LYRA_REPO_PATH) {
    return process.env.LYRA_REPO_PATH;
  }

  const homedir = os.homedir();
  const env = getNodeEnv();

  if (env === "test") {
    return path.join(homedir, ".lyra_test");
  }

  const isDev = env === "development" || env === "develop";
  return path.join(homedir, isDev ? ".lyra_dev" : ".lyra");
}

function ensureConfigLoadedSync(): void {
  if (configLoaded) return;
  try {
    const defaultRepoPath = getDefaultRepoPath();
    const configHome =
      process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    const legacyConfigPath = path.join(configHome, "lyra", "config.json");
    const configPath = path.join(defaultRepoPath, "config.json");

    if (fsSync.existsSync(legacyConfigPath)) {
      try {
        const legacyContent = fsSync.readFileSync(legacyConfigPath, "utf-8");

        if (!fsSync.existsSync(defaultRepoPath)) {
          fsSync.mkdirSync(defaultRepoPath, { recursive: true });
        }

        fsSync.writeFileSync(configPath, legacyContent, "utf-8");
      } catch (migrationErr) {
        console.error("Failed to migrate legacy config:", migrationErr);
      }
    }

    if (fsSync.existsSync(configPath)) {
      const content = fsSync.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(content);
      appConfig = { ...appConfig, ...parsed };
      if (parsed.customRepoPath) {
        customRepoPath = parsed.customRepoPath;
      }
    } else {
      const settingsPath = path.join(defaultRepoPath, "settings.json");
      if (fsSync.existsSync(settingsPath)) {
        try {
          const content = fsSync.readFileSync(settingsPath, "utf-8");
          const parsed = JSON.parse(content);
          appConfig = { ...appConfig, ...parsed };
        } catch {}
      }
    }

    if (customRepoPath && customRepoPath !== defaultRepoPath) {
      const customConfigPath = path.join(customRepoPath, "config.json");
      if (fsSync.existsSync(customConfigPath)) {
        try {
          const content = fsSync.readFileSync(customConfigPath, "utf-8");
          const parsed = JSON.parse(content);
          appConfig = { ...appConfig, ...parsed };
        } catch (customErr) {
          console.error("Failed to read custom config:", customErr);
        }
      }
    }

    const activeRepoPath = customRepoPath || defaultRepoPath;
    const envPath = path.join(activeRepoPath, ".env");
    if (fsSync.existsSync(envPath)) {
      try {
        const envVars = parseEnvFile(fsSync.readFileSync(envPath, "utf-8"));
        for (const [envKey, configKey] of Object.entries(ENV_CONFIG_KEYS)) {
          if (envVars[envKey]) {
            (appConfig as Record<string, unknown>)[configKey] = envVars[envKey];
          }
        }
      } catch (envErr) {
        console.error("Failed to read .env secrets:", envErr);
      }
    }

    if (appConfig.useKeychain && isKeychainAvailable()) {
      for (const [envKey, configKey] of Object.entries(SECRET_ENV_KEYS)) {
        const value = getSecret(envKey);
        if (value) {
          (appConfig as Record<string, unknown>)[configKey] = value;
        }
      }
    }
  } catch (err) {
    console.error("Failed to load config synchronously:", err);
  }
  configLoaded = true;
}

export function getConfig(): AppConfig {
  ensureConfigLoadedSync();
  return appConfig;
}

export function resetServices(): void {
  void embeddingService?.dispose();
  gitService = null;
  embeddingService = null;
  customRepoPath = null;
  configLoaded = false;
  appConfig = {
    autoSyncEnabled: false,
    autoSyncIntervalMins: 5,
  };
}

export async function saveConfig(config: AppConfig): Promise<void> {
  try {
    ensureConfigLoadedSync();
    appConfig = { ...appConfig, ...config };

    const defaultRepoPath = getDefaultRepoPath();

    if (config.customRepoPath !== undefined) {
      customRepoPath = config.customRepoPath;
    }

    const activeRepoPath = customRepoPath || defaultRepoPath;

    await fs.mkdir(activeRepoPath, { recursive: true });

    const settings: Record<string, unknown> = {};
    const secrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(appConfig)) {
      if (value === undefined) continue;
      if (SECRET_CONFIG_KEYS.has(key as keyof AppConfig)) {
        const envKey = Object.keys(SECRET_ENV_KEYS).find(
          (k) => SECRET_ENV_KEYS[k] === key,
        );
        if (envKey && value !== "") secrets[envKey] = String(value);
      } else {
        settings[key] = value;
      }
    }

    const configFilePath = path.join(activeRepoPath, "config.json");
    const content = JSON.stringify(settings, null, 2);
    await fs.writeFile(configFilePath, content, "utf-8");

    await saveSecrets(activeRepoPath, secrets);

    if (customRepoPath && customRepoPath !== defaultRepoPath) {
      await fs.mkdir(defaultRepoPath, { recursive: true });
      const redirectionConfigPath = path.join(defaultRepoPath, "config.json");
      const redirectionContent = JSON.stringify({ customRepoPath }, null, 2);
      await fs.writeFile(redirectionConfigPath, redirectionContent, "utf-8");
    }
  } catch (err) {
    console.error("Failed to save config:", err);
  }
}

async function saveSecrets(
  repoPath: string,
  secrets: Record<string, string>,
): Promise<void> {
  const envPath = path.join(repoPath, ".env");
  let existing: Record<string, string> = {};
  try {
    existing = parseEnvFile(await fs.readFile(envPath, "utf-8"));
  } catch {}

  const merged = { ...existing };
  for (const key of Object.keys(SECRET_ENV_KEYS)) {
    delete merged[key];
  }

  if (appConfig.useKeychain && isKeychainAvailable()) {
    const fallback: Record<string, string> = {};
    for (const [key, value] of Object.entries(secrets)) {
      if (!setSecret(key, value)) {
        fallback[key] = value;
      }
    }
    Object.assign(merged, fallback);
  } else {
    Object.assign(merged, secrets);
  }

  const lines = Object.entries(merged).map(([key, value]) => `${key}=${value}`);
  await fs.writeFile(envPath, `${lines.join("\n")}\n`, "utf-8");

  const gitignorePath = path.join(repoPath, ".gitignore");
  let gitignore = "";
  try {
    gitignore = await fs.readFile(gitignorePath, "utf-8");
  } catch {}
  if (!gitignore.split("\n").some((line) => line.trim() === ".env")) {
    const prefix =
      gitignore.length > 0 && !gitignore.endsWith("\n") ? "\n" : "";
    await fs.writeFile(gitignorePath, `${gitignore}${prefix}.env\n`, "utf-8");
  }
}

export const getRepoPath = (): string => {
  ensureConfigLoadedSync();
  if (customRepoPath) {
    return customRepoPath;
  }
  return getDefaultRepoPath();
};

export const getMyDayPath = (): string => {
  return path.join(getRepoPath(), "myday");
};

export function getGitService(): GitService {
  if (!gitService) {
    gitService = new GitService(getRepoPath());
  }
  return gitService;
}

export function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}

export function shouldIndexInBackground(): boolean {
  return process.env.LYRA_CLI_MODE !== "1";
}

export function getRelativePath(folderName: string, filename: string): string {
  if (folderName === "myday") {
    return path.join("myday", filename);
  }
  if (
    !folderName ||
    folderName === "/" ||
    folderName.toLowerCase() === "root"
  ) {
    return filename;
  }
  const safeFolderName = path.basename(folderName);
  return path.join(safeFolderName, filename);
}

export function backgroundCommit(
  message: string,
  files?: string | string[],
): void {
  getGitService()
    .commit(message, files)
    .catch((err) => {
      console.error("Background Git commit failed:", err);
    });
}

export async function ensureDirs(): Promise<void> {
  const repoPath = getRepoPath();
  const myDayPath = getMyDayPath();
  try {
    await fs.mkdir(repoPath, { recursive: true });
    await fs.mkdir(myDayPath, { recursive: true });
  } catch (err) {
    console.error("Failed to create repository directories:", err);
  }
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function resolveFolderPath(folderName: string): string {
  const repoPath = getRepoPath();
  if (
    !folderName ||
    folderName === "/" ||
    folderName.toLowerCase() === "root"
  ) {
    return repoPath;
  }
  const normalizedFolderName = folderName.trim();
  if (
    normalizedFolderName !== path.basename(normalizedFolderName) ||
    normalizedFolderName === "." ||
    normalizedFolderName === ".."
  ) {
    throw new Error("Invalid vault folder name");
  }
  return path.join(repoPath, normalizedFolderName);
}

export function resolveNotePath(folderName: string, filename: string): string {
  const normalizedFilename = filename.trim();
  if (
    !normalizedFilename.endsWith(".md") ||
    normalizedFilename !== path.basename(normalizedFilename) ||
    normalizedFilename === ".md"
  ) {
    throw new Error("Invalid note filename");
  }
  return path.join(resolveFolderPath(folderName), normalizedFilename);
}

export async function assertPathInsideVault(filePath: string): Promise<void> {
  const vaultPath = await fs.realpath(getRepoPath());
  const resolvedPath = await fs.realpath(filePath);
  const relative = path.relative(vaultPath, resolvedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path must stay inside the vault");
  }
}

export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
