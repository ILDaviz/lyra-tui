import { Command } from "commander";
import { getRepoPath, getConfig, getGitService } from "../../helpers";
import { listFolders } from "../../services/folders-service";
import { scanTodos } from "../../services/todos-service";
import { getLinks } from "../../services/links-service";
import { listMyDayNotes } from "../../services/myday-service";
import { getDefaultModel } from "../../ai";
import { print } from "../output";

export async function statusAction(
  options: { json?: boolean } = {},
): Promise<void> {
  const repoPath = getRepoPath();
  const config = getConfig();
  const git = getGitService();

  const isGitRepo = await git.isGitRepo();
  const remote = isGitRepo ? await git.getRemote() : null;

  const folders = await listFolders();
  const todos = await scanTodos();
  const links = await getLinks();
  const myDayNotes = await listMyDayNotes();

  const pendingTodos = todos.filter((t) => !t.done).length;
  const completedTodos = todos.filter((t) => t.done).length;

  if (options.json) {
    const statusData = {
      repoPath,
      git: {
        isRepo: isGitRepo,
        remote,
      },
      stats: {
        foldersCount: folders.length,
        todos: {
          total: todos.length,
          pending: pendingTodos,
          completed: completedTodos,
        },
        linksCount: links.length,
        myDayLogsCount: myDayNotes.length,
      },
      config: {
        language: config.language || "en",
        aiProvider: config.aiProvider || "openai",
        aiModel:
          config.aiModel || getDefaultModel(config.aiProvider || "openai"),
        autoSyncEnabled: !!config.autoSyncEnabled,
        autoSyncIntervalMins: config.autoSyncIntervalMins || 5,
      },
    };
    print(JSON.stringify(statusData, null, 2));
    return;
  }

  const effectiveProvider = config.aiProvider || "openai";
  const effectiveModel = config.aiModel || getDefaultModel(effectiveProvider);

  print("\n  \x1b[1;35m✦ Lyra Vault Status\x1b[0m\n");
  print(`  \x1b[1mRepository Path:\x1b[0m   ${repoPath}`);
  print(
    `  \x1b[1mGit Status:\x1b[0m        ${isGitRepo ? `\x1b[32mActive\x1b[0m` : "\x1b[33mNot initialized\x1b[0m"}`,
  );
  if (remote) {
    print(`  \x1b[1mGit Remote:\x1b[0m        ${remote}`);
  }
  print(
    `  \x1b[1mFolders:\x1b[0m           ${folders.length} (including root)`,
  );
  print(
    `  \x1b[1mTodos:\x1b[0m             ${todos.length} total (\x1b[33m${pendingTodos} pending\x1b[0m, \x1b[32m${completedTodos} completed\x1b[0m)`,
  );
  print(`  \x1b[1mLinks:\x1b[0m             ${links.length}`);
  print(`  \x1b[1mDaily Logs:\x1b[0m        ${myDayNotes.length}`);
  print(
    `  \x1b[1mAI Provider:\x1b[0m       ${effectiveProvider} (${effectiveModel})`,
  );
  print(
    `  \x1b[1mAuto-Sync:\x1b[0m         ${config.autoSyncEnabled ? `\x1b[32mEnabled\x1b[0m (every ${config.autoSyncIntervalMins || 5}m)` : "\x1b[33mDisabled\x1b[0m"}\n`,
  );
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show vault status, statistics and configuration")
    .option(
      "-j, --json",
      "Output status and statistics in structured JSON format",
    )
    .action(async (options) => {
      await statusAction(options);
    });
}
