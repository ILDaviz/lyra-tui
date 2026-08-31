import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

import {
  getRelativePath,
  resolveFolderPath,
  getRepoPath,
  getDefaultRepoPath,
  getMyDayPath,
  exists,
  ensureDirs,
  getGitService,
  getLocalDateString,
  initEnvironment,
  parseEnvFile,
} from "../src/helpers";

describe("Helpers", () => {
  const repoPath = getRepoPath();

  it("should resolve correct repo and myday paths", () => {
    expect(getRepoPath()).toBeDefined();
    expect(getMyDayPath()).toBe(path.join(repoPath, "myday"));
  });

  it("should resolve correct relative path", () => {
    expect(getRelativePath("myday", "2026-07-05.md")).toBe(
      path.join("myday", "2026-07-05.md"),
    );
    expect(getRelativePath("/", "note.md")).toBe("note.md");
    expect(getRelativePath("root", "note.md")).toBe("note.md");
    expect(getRelativePath("", "note.md")).toBe("note.md");
    expect(getRelativePath("Work", "meeting.md")).toBe(
      path.join("Work", "meeting.md"),
    );
  });

  it("should resolve folder paths correctly", () => {
    expect(resolveFolderPath("/")).toBe(repoPath);
    expect(resolveFolderPath("root")).toBe(repoPath);
    expect(resolveFolderPath("")).toBe(repoPath);
    expect(resolveFolderPath("Work")).toBe(path.join(repoPath, "Work"));
  });

  it("should verify file existence", async () => {
    const tempDir = path.join(__dirname, "temp-helpers");
    await fs.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, "exists-test.txt");

    expect(await exists(filePath)).toBe(false);

    await fs.writeFile(filePath, "test");
    expect(await exists(filePath)).toBe(true);

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("should ensure directories are created", async () => {
    await ensureDirs();
    const repoExists = await exists(getRepoPath());
    const myDayExists = await exists(getMyDayPath());

    expect(repoExists).toBe(true);
    expect(myDayExists).toBe(true);
  });

  it("should lazily initialize and retrieve GitService", () => {
    const gitService = getGitService();
    expect(gitService).toBeDefined();
    expect(getGitService()).toBe(gitService);
  });

  it("should format local date correctly with YYYY-MM-DD", () => {
    const d = new Date(2026, 7, 21, 0, 15, 0);
    expect(getLocalDateString(d)).toBe("2026-08-21");
  });

  it("should initialize logger and write to .lyra/logs/lyra-{date}.log", async () => {
    const { initTuiLogging } = await import("../src/logger");
    initTuiLogging();
    console.log("Testing logger output");

    const logsDir = path.join(getRepoPath(), ".lyra", "logs");
    const logFile = path.join(logsDir, `lyra-${getLocalDateString()}.log`);

    expect(await exists(logsDir)).toBe(true);
    expect(await exists(logFile)).toBe(true);

    const content = await fs.readFile(logFile, "utf-8");
    expect(content).toContain("Testing logger output");
  });

  describe("initEnvironment & NODE_ENV resolution", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalLyraRepoPath = process.env.LYRA_REPO_PATH;
    const testTempDir = path.join(__dirname, "temp-env-test");

    beforeAll(async () => {
      await fs.mkdir(testTempDir, { recursive: true });
    });

    afterAll(async () => {
      if (originalNodeEnv !== undefined) {
        process.env.NODE_ENV = originalNodeEnv;
      } else {
        delete process.env.NODE_ENV;
      }
      if (originalLyraRepoPath !== undefined) {
        process.env.LYRA_REPO_PATH = originalLyraRepoPath;
      } else {
        delete process.env.LYRA_REPO_PATH;
      }
      await fs
        .rm(testTempDir, { recursive: true, force: true })
        .catch(() => {});
    });

    it("should parse .env file content correctly", () => {
      const content = `
# Comment
NODE_ENV=develop
CUSTOM_KEY="custom_value"
ANOTHER_KEY='single_quoted'
INVALID_LINE
`;
      const parsed = parseEnvFile(content);
      expect(parsed.NODE_ENV).toBe("develop");
      expect(parsed.CUSTOM_KEY).toBe("custom_value");
      expect(parsed.ANOTHER_KEY).toBe("single_quoted");
    });

    it("should default NODE_ENV to production when no .env and unset", () => {
      delete process.env.NODE_ENV;
      const nonExistentDir = path.join(testTempDir, "empty");
      const env = initEnvironment(nonExistentDir);
      expect(env).toBe("production");
      expect(process.env.NODE_ENV).toBe("production");
    });

    it("should load NODE_ENV=develop from .env and normalize to development", async () => {
      delete process.env.NODE_ENV;
      const envDir = path.join(testTempDir, "develop-env");
      await fs.mkdir(envDir, { recursive: true });
      await fs.writeFile(path.join(envDir, ".env"), "NODE_ENV=develop\n");

      const env = initEnvironment(envDir);
      expect(env).toBe("development");
      expect(process.env.NODE_ENV).toBe("development");
    });

    it("should load NODE_ENV=development from .env", async () => {
      delete process.env.NODE_ENV;
      const envDir = path.join(testTempDir, "development-env");
      await fs.mkdir(envDir, { recursive: true });
      await fs.writeFile(path.join(envDir, ".env"), "NODE_ENV=development\n");

      const env = initEnvironment(envDir);
      expect(env).toBe("development");
      expect(process.env.NODE_ENV).toBe("development");
    });

    it("should normalize existing process.env.NODE_ENV=develop to development", () => {
      process.env.NODE_ENV = "develop";
      const env = initEnvironment(testTempDir);
      expect(env).toBe("development");
      expect(process.env.NODE_ENV).toBe("development");
    });

    it("should resolve default repo paths correctly depending on NODE_ENV", () => {
      delete process.env.LYRA_REPO_PATH;
      const homedir = os.homedir();

      process.env.NODE_ENV = "production";
      expect(getDefaultRepoPath()).toBe(path.join(homedir, ".lyra"));

      process.env.NODE_ENV = "development";
      expect(getDefaultRepoPath()).toBe(path.join(homedir, ".lyra_dev"));

      process.env.NODE_ENV = "develop";
      expect(getDefaultRepoPath()).toBe(path.join(homedir, ".lyra_dev"));

      process.env.NODE_ENV = "test";
      expect(getDefaultRepoPath()).toBe(path.join(homedir, ".lyra_test"));
    });
  });
});
