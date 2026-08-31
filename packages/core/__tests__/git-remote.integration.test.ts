import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { GitService } from "../src/git-service";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

describe("GitService remote integration", () => {
  let rootPath = "";
  let remotePath = "";
  let vaultPath = "";
  let service: GitService;

  beforeEach(async () => {
    rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "lyra-git-remote-"));
    remotePath = path.join(rootPath, "remote.git");
    vaultPath = path.join(rootPath, "vault");
    await git(rootPath, ["init", "--bare", remotePath]);
    await fs.mkdir(vaultPath);

    service = new GitService(vaultPath);
    await service.init();
    await service.setRemote(remotePath);
    await service.push();
  });

  afterEach(async () => {
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  it("adds, updates, and removes origin", async () => {
    expect(await service.getRemote()).toBe(remotePath);

    const replacementRemote = path.join(rootPath, "replacement.git");
    await git(rootPath, ["init", "--bare", replacementRemote]);
    await service.setRemote(replacementRemote);
    expect(await service.getRemote()).toBe(replacementRemote);

    await service.setRemote("");
    expect(await service.getRemote()).toBeNull();
  });

  it("pushes local changes and pulls changes from another clone", async () => {
    await fs.writeFile(path.join(vaultPath, "local.md"), "local", "utf-8");
    await expect(
      service.commit("docs: add local note", "local.md"),
    ).resolves.toBe(true);
    await service.push();

    const clonePath = path.join(rootPath, "other-device");
    await git(rootPath, ["clone", remotePath, clonePath]);
    await git(clonePath, ["config", "user.name", "Test User"]);
    await git(clonePath, ["config", "user.email", "test@example.com"]);
    await fs.writeFile(path.join(clonePath, "remote.md"), "remote", "utf-8");
    await git(clonePath, ["add", "remote.md"]);
    await git(clonePath, ["commit", "-m", "docs: add remote note"]);
    await git(clonePath, ["push"]);

    await service.pull();

    await expect(
      fs.readFile(path.join(vaultPath, "remote.md"), "utf-8"),
    ).resolves.toBe("remote");
  });

  it("surfaces merge conflicts without hiding the conflicted file", async () => {
    const filename = "shared.md";
    await fs.writeFile(path.join(vaultPath, filename), "base\n", "utf-8");
    await service.commit("docs: add shared note", filename);
    await service.push();

    const clonePath = path.join(rootPath, "other-device");
    await git(rootPath, ["clone", remotePath, clonePath]);
    await git(clonePath, ["config", "user.name", "Test User"]);
    await git(clonePath, ["config", "user.email", "test@example.com"]);
    await fs.writeFile(
      path.join(clonePath, filename),
      "remote change\n",
      "utf-8",
    );
    await git(clonePath, ["add", filename]);
    await git(clonePath, ["commit", "-m", "docs: remote change"]);
    await git(clonePath, ["push"]);

    await fs.writeFile(
      path.join(vaultPath, filename),
      "local change\n",
      "utf-8",
    );
    await service.commit("docs: local change", filename);

    await expect(service.pull()).rejects.toBeDefined();
    await expect(
      fs.readFile(path.join(vaultPath, filename), "utf-8"),
    ).resolves.toContain("<<<<<<<");
  });

  it("rejects pull and push when no remote is configured", async () => {
    const isolatedPath = path.join(rootPath, "no-remote");
    await fs.mkdir(isolatedPath);
    const isolatedService = new GitService(isolatedPath);
    await isolatedService.init();

    await expect(isolatedService.pull()).rejects.toThrow();
    await expect(isolatedService.push()).rejects.toThrow();
  });
});
