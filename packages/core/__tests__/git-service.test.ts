import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { GitService } from "../src/git-service";

const execFileAsync = promisify(execFile);

describe("GitService", () => {
  const testRepoPath = path.join(__dirname, "temp-test-repo");

  beforeAll(async () => {
    await fs.rm(testRepoPath, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(testRepoPath, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testRepoPath, { recursive: true, force: true }).catch(() => {});
  });

  it("should verify git availability", async () => {
    const gitService = new GitService(testRepoPath);
    const available = await gitService.checkGitAvailability();
    expect(typeof available).toBe("boolean");
  });

  it("should detect that a new folder is not a git repo", async () => {
    const gitService = new GitService(testRepoPath);
    const isRepo = await gitService.isGitRepo();
    expect(isRepo).toBe(false);
  });

  it("should initialize a git repo", async () => {
    const gitService = new GitService(testRepoPath);
    await gitService.init();

    const isRepo = await gitService.isGitRepo();
    expect(isRepo).toBe(true);

    const gitignorePath = path.join(testRepoPath, ".gitignore");
    const gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
    expect(gitignoreContent).toContain(".DS_Store");
    expect(gitignoreContent).toContain(".lyra/");
  });

  it("should handle commit workflow", async () => {
    const gitService = new GitService(testRepoPath);

    const filePath = path.join(testRepoPath, "test-file.txt");
    await fs.writeFile(filePath, "Hello world", "utf-8");

    const committed = await gitService.commit(
      "feat: add test file",
      "test-file.txt",
    );
    expect(committed).toBe(true);

    const committedAgain = await gitService.commit(
      "feat: add test file again",
      "test-file.txt",
    );
    expect(committedAgain).toBe(false);
  });

  it("should get history of the repository", async () => {
    const gitService = new GitService(testRepoPath);
    const history = await gitService.getHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);

    const firstCommit = history[0];
    expect(firstCommit.hash).toBeDefined();
    expect(firstCommit.message).toBeDefined();
    expect(firstCommit.author).toBeDefined();
    expect(firstCommit.date).toBeDefined();
    expect(firstCommit.timestamp).toBeTypeOf("number");
  });

  it("should retrieve content of a file at a specific commit", async () => {
    const gitService = new GitService(testRepoPath);
    const history = await gitService.getHistory();

    const latestCommitHash = history[0].hash;

    const content = await gitService.getFileContentAtCommit(
      latestCommitHash,
      "test-file.txt",
    );
    expect(content).toBe("Hello world");
  });

  it("should restore a file to a previous commit", async () => {
    const gitService = new GitService(testRepoPath);
    const filePath = path.join(testRepoPath, "test-file.txt");

    const historyBefore = await gitService.getHistory();

    const firstCommit = historyBefore.find(
      (c) => c.message === "feat: add test file",
    );
    expect(firstCommit).toBeDefined();
    const firstCommitHash = firstCommit!.hash;

    await fs.writeFile(filePath, "Hello modified world", "utf-8");
    const committed = await gitService.commit(
      "feat: modify test file",
      "test-file.txt",
    );
    expect(committed).toBe(true);

    const contentModified = await fs.readFile(filePath, "utf-8");
    expect(contentModified).toBe("Hello modified world");

    await gitService.restoreFile(firstCommitHash, "test-file.txt");

    const contentRestored = await fs.readFile(filePath, "utf-8");
    expect(contentRestored).toBe("Hello world");

    const historyAfter = await gitService.getHistory();
    expect(historyAfter[0].message).toContain("restore 'test-file.txt'");
  });

  it("should track file names across renames", async () => {
    const gitService = new GitService(testRepoPath);
    const oldPath = "old-file-name.txt";
    const newPath = "new-file-name.txt";

    await fs.writeFile(
      path.join(testRepoPath, oldPath),
      "Initial content",
      "utf-8",
    );
    const firstCommitSuccess = await gitService.commit(
      "feat: initial commit",
      oldPath,
    );
    expect(firstCommitSuccess).toBe(true);

    const history1 = await gitService.getHistory(oldPath);
    const firstCommitHash = history1[0].hash;

    await fs.rename(
      path.join(testRepoPath, oldPath),
      path.join(testRepoPath, newPath),
    );
    const renameCommitSuccess = await gitService.commit("rename file", [
      oldPath,
      newPath,
    ]);
    expect(renameCommitSuccess).toBe(true);

    const history2 = await gitService.getHistory(newPath);
    expect(history2.length).toBeGreaterThanOrEqual(2);

    const resolvedOldPath = await gitService.getPathAtCommit(
      firstCommitHash,
      newPath,
    );
    expect(resolvedOldPath).toBe(oldPath);

    const content = await gitService.getFileContentAtCommit(
      firstCommitHash,
      newPath,
    );
    expect(content).toBe("Initial content");
  });

  it("should filter out starter note update commits from history", async () => {
    const gitService = new GitService(testRepoPath);
    const tempFile = "temp-untitled.txt";
    await fs.writeFile(path.join(testRepoPath, tempFile), "Content", "utf-8");

    await gitService.commit('docs(notes): update note "Real Note"', tempFile);
    await gitService.commit(
      'docs(notes): update note "Untitled Note.md"',
      tempFile,
    );

    const history = await gitService.getHistory(tempFile);

    const hasStarterCommit = history.some((c) =>
      c.message.includes('update note "Untitled Note.md"'),
    );
    const hasRealCommit = history.some((c) =>
      c.message.includes('update note "Real Note"'),
    );

    expect(hasStarterCommit).toBe(false);
    expect(hasRealCommit).toBe(true);
  });

  it("should untrack a pre-existing tracked .env on commit", async () => {
    const legacyRepoPath = path.join(__dirname, "temp-test-repo-legacy-env");
    await fs
      .rm(legacyRepoPath, { recursive: true, force: true })
      .catch(() => {});
    await fs.mkdir(legacyRepoPath, { recursive: true });

    await fs.writeFile(
      path.join(legacyRepoPath, "note.md"),
      "note content",
      "utf-8",
    );
    await fs.writeFile(
      path.join(legacyRepoPath, ".env"),
      "OPENAI_TOKEN=supersecret",
      "utf-8",
    );

    await execFileAsync("git", ["init"], { cwd: legacyRepoPath });
    await execFileAsync("git", ["config", "user.email", "test@test.local"], {
      cwd: legacyRepoPath,
    });
    await execFileAsync("git", ["config", "user.name", "Test"], {
      cwd: legacyRepoPath,
    });
    await execFileAsync("git", ["add", "."], { cwd: legacyRepoPath });
    await execFileAsync("git", ["commit", "-m", "legacy initial commit"], {
      cwd: legacyRepoPath,
    });

    const gitService = new GitService(legacyRepoPath);
    expect(await gitService.isTracked(".env")).toBe(true);

    await fs.writeFile(
      path.join(legacyRepoPath, "note.md"),
      "note content updated",
      "utf-8",
    );
    const committed = await gitService.commit("docs: update note", "note.md");
    expect(committed).toBe(true);

    expect(await gitService.isTracked(".env")).toBe(false);

    const envContent = await fs.readFile(
      path.join(legacyRepoPath, ".env"),
      "utf-8",
    );
    expect(envContent).toContain("OPENAI_TOKEN=supersecret");

    const gitignoreContent = await fs.readFile(
      path.join(legacyRepoPath, ".gitignore"),
      "utf-8",
    );
    expect(gitignoreContent).toContain(".env");

    await fs
      .rm(legacyRepoPath, { recursive: true, force: true })
      .catch(() => {});
  });
});
