import { execFile } from "child_process";
import * as util from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { GitCommitInfo } from "./types";
import * as i18n from "./i18n";

const execFilePromise = util.promisify(execFile);

export class GitService {
  private repoPath: string;
  private commitQueue: Promise<void> = Promise.resolve();

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  private async run(
    args: string[],
    options?: { ignoreError?: boolean },
  ): Promise<string> {
    if (!(await this.checkGitAvailability())) {
      throw new Error(i18n.t(i18n.CORE_I18N_KEYS.ERROR_GIT_MISSING));
    }
    try {
      const { stdout } = await execFilePromise("git", args, {
        cwd: this.repoPath,
      });
      return stdout.trim();
    } catch (err: any) {
      if (!options?.ignoreError) {
        console.error(`Git command error: git ${args.join(" ")}`, err.message);
      }
      throw err;
    }
  }

  private gitAvailable: boolean | null = null;

  async checkGitAvailability(): Promise<boolean> {
    if (this.gitAvailable !== null) return this.gitAvailable;
    try {
      await execFilePromise("git", ["--version"]);
      this.gitAvailable = true;
    } catch (err) {
      this.gitAvailable = false;
      console.warn(
        "Git is not installed or not available in the system PATH. Git-based features will be disabled.",
      );
    }
    return this.gitAvailable;
  }

  async isGitRepo(): Promise<boolean> {
    if (!(await this.checkGitAvailability())) return false;
    try {
      await fs.access(path.join(this.repoPath, ".git"));
      return true;
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    if (!(await this.checkGitAvailability())) return;
    const isRepo = await this.isGitRepo();
    if (isRepo) return;

    try {
      await this.run(["init"]);

      const gitignorePath = path.join(this.repoPath, ".gitignore");
      let gitignore = "";
      try {
        gitignore = await fs.readFile(gitignorePath, "utf-8");
      } catch {}
      const ignoredEntries = [".DS_Store", "Thumbs.db", ".env", ".lyra/"];
      const missingEntries = ignoredEntries.filter(
        (entry) => !gitignore.split("\n").some((line) => line.trim() === entry),
      );
      if (missingEntries.length > 0) {
        const prefix = gitignore && !gitignore.endsWith("\n") ? "\n" : "";
        await fs.writeFile(
          gitignorePath,
          `${gitignore}${prefix}${missingEntries.join("\n")}\n`,
          "utf-8",
        );
      }

      let hasIdentity = true;
      try {
        await this.run(["config", "user.name"]);
        await this.run(["config", "user.email"]);
      } catch {
        hasIdentity = false;
      }

      if (!hasIdentity) {
        await this.run(["config", "user.name", "Lyra"]);
        await this.run(["config", "user.email", "lyra-auto-save@local.host"]);
      }

      await this.run(["add", "."]);
      await this.run(["commit", "-m", "chore: initialize Lyra repository"]);
      console.log("Git repository initialized successfully.");
    } catch (err) {
      console.error("Failed to initialize Git repository:", err);
    }
  }

  private async exists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  async isTracked(relativePath: string): Promise<boolean> {
    try {
      const gitPath = relativePath.replace(/\\/g, "/");
      const output = await this.run(["ls-files", "--", gitPath], {
        ignoreError: true,
      });
      return output.trim() !== "";
    } catch {
      return false;
    }
  }

  async commit(message: string, files?: string | string[]): Promise<boolean> {
    const queuedCommit = this.commitQueue.then(() =>
      this.commitNow(message, files),
    );
    this.commitQueue = queuedCommit.then(
      () => undefined,
      () => undefined,
    );
    return queuedCommit;
  }

  private async commitNow(
    message: string,
    files?: string | string[],
  ): Promise<boolean> {
    try {
      await this.init();

      if (files) {
        const filesArray = Array.isArray(files) ? files : [files];
        const gitPaths = filesArray.map((f) => f.replace(/\\/g, "/"));

        const pathsToAdd: string[] = [];
        for (const gp of gitPaths) {
          const absolutePath = path.join(this.repoPath, gp);
          const fileExists = await this.exists(absolutePath);
          if (fileExists) {
            pathsToAdd.push(gp);
          } else {
            const tracked = await this.isTracked(gp);
            if (tracked) {
              pathsToAdd.push(gp);
            }
          }
        }

        if (pathsToAdd.length === 0) {
          return false;
        }

        const pendingChanges = await this.run(
          ["status", "--porcelain", "--", ...pathsToAdd],
          { ignoreError: true },
        );
        // Git does not track empty directories; skip them without issuing a failing add.
        if (!pendingChanges) {
          return false;
        }

        await this.run(["add", "-A", "--", ...pathsToAdd]);
      } else {
        await this.run(["add", "."]);
      }

      try {
        await this.run(["diff", "--cached", "--quiet"], { ignoreError: true });
        return false;
      } catch (err: any) {
        if (err.code === 1) {
          await this.run(["commit", "-m", message]);
          return true;
        }
        throw err;
      }
    } catch (err) {
      console.error(`Git commit failed for message "${message}":`, err);
      return false;
    }
  }

  async getHistory(relativePath?: string): Promise<GitCommitInfo[]> {
    try {
      await this.init();

      const args = [
        "log",
        "--pretty=format:%H||%an||%ad||%at||%s",
        "--date=iso",
      ];
      if (relativePath) {
        const gitPath = relativePath.replace(/\\/g, "/");
        args.push("--follow", "--", gitPath);
      }

      const output = await this.run(args);
      if (!output) return [];

      const commits = output.split("\n").map((line) => {
        const [hash, author, date, timestampStr, message] = line.split("||");
        return {
          hash: hash || "",
          author: author || "",
          date: date || "",
          timestamp: parseInt(timestampStr, 10) * 1000 || Date.now(),
          message: message || "",
        };
      });

      return commits.filter((commit) => {
        const lowerMsg = commit.message.toLowerCase();
        return !(
          lowerMsg.includes('update note "untitled note') ||
          lowerMsg.includes('update note "nota senza titolo')
        );
      });
    } catch (err) {
      console.error(`Git log failed for path "${relativePath}":`, err);
      return [];
    }
  }

  async getPathAtCommit(
    commitHash: string,
    relativePath: string,
  ): Promise<string> {
    try {
      const gitPath = relativePath.replace(/\\/g, "/");
      const output = await this.run(
        ["log", "--follow", "--name-only", "--format=%H", "--", gitPath],
        { ignoreError: true },
      );
      if (!output) return gitPath;

      const lines = output
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === commitHash && i + 1 < lines.length) {
          return lines[i + 1];
        }
      }
      return gitPath;
    } catch {
      return relativePath.replace(/\\/g, "/");
    }
  }

  async getFileContentAtCommit(
    commitHash: string,
    relativePath: string,
  ): Promise<string> {
    try {
      const actualPath = await this.getPathAtCommit(commitHash, relativePath);
      const content = await this.run(["show", `${commitHash}:${actualPath}`]);
      return content;
    } catch (err) {
      console.error(`Git show failed for ${commitHash}:${relativePath}`, err);
      throw err;
    }
  }

  async restoreFile(commitHash: string, relativePath: string): Promise<void> {
    try {
      const gitPath = relativePath.replace(/\\/g, "/");
      const content = await this.getFileContentAtCommit(
        commitHash,
        relativePath,
      );

      const absolutePath = path.join(this.repoPath, gitPath);
      await fs.writeFile(absolutePath, content, "utf-8");

      await this.commit(
        `chore(history): restore '${relativePath}' to commit ${commitHash.substring(0, 7)}`,
        relativePath,
      );
      console.log(
        `Successfully restored ${relativePath} to commit ${commitHash.substring(0, 7)}`,
      );
    } catch (err) {
      console.error(
        `Git restore failed for ${commitHash}:${relativePath}`,
        err,
      );
      throw err;
    }
  }

  async getRemote(): Promise<string | null> {
    try {
      await this.init();
      const output = await this.run(["remote", "get-url", "origin"], {
        ignoreError: true,
      });
      return output.trim() || null;
    } catch {
      return null;
    }
  }

  async setRemote(url: string): Promise<void> {
    try {
      await this.init();
      const existing = await this.getRemote();
      if (existing) {
        if (!url) {
          await this.run(["remote", "remove", "origin"]);
        } else {
          await this.run(["remote", "set-url", "origin", url]);
        }
      } else if (url) {
        await this.run(["remote", "add", "origin", url]);
      }
    } catch (err) {
      console.error("Failed to set Git remote:", err);
      throw err;
    }
  }

  async pull(): Promise<string> {
    try {
      await this.init();
      const remote = await this.getRemote();
      if (!remote) {
        throw new Error(i18n.t(i18n.CORE_I18N_KEYS.ERROR_GIT_NO_REMOTE));
      }
      let branchName = "main";
      try {
        const activeBranch = await this.run(["branch", "--show-current"]);
        if (activeBranch) branchName = activeBranch;
      } catch {}
      return await this.run([
        "pull",
        "--no-rebase",
        "--allow-unrelated-histories",
        "origin",
        branchName,
      ]);
    } catch (err: any) {
      console.error("Git pull failed:", err);
      throw err;
    }
  }

  async push(): Promise<string> {
    try {
      await this.init();
      const remote = await this.getRemote();
      if (!remote) {
        throw new Error(i18n.t(i18n.CORE_I18N_KEYS.ERROR_GIT_NO_REMOTE));
      }
      let branchName = "main";
      try {
        const activeBranch = await this.run(["branch", "--show-current"]);
        if (activeBranch) branchName = activeBranch;
      } catch {}
      return await this.run(["push", "-u", "origin", branchName]);
    } catch (err: any) {
      console.error("Git push failed:", err);
      throw err;
    }
  }
}
