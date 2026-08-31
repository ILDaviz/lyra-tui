import { Command } from "commander";
import { getGitService, getConfig } from "../../helpers";
import {
  startAutoSyncScheduler,
  stopAutoSyncScheduler,
} from "../../services/auto-sync";
import { print, printError, write } from "../output";

export async function daemonAction(
  options: { dryRun?: boolean } = {},
): Promise<void> {
  const git = getGitService();
  const isRepo = await git.isGitRepo();

  if (!isRepo) {
    printError(
      "\x1b[31mError:\x1b[0m Not a git repository. Initialize git in your vault first.",
    );
    process.exitCode = 1;
    return;
  }

  const config = getConfig();
  const intervalMins = config.autoSyncIntervalMins || 5;

  if (options.dryRun) {
    print(
      `\n  \x1b[33mDry run:\x1b[0m would start the sync daemon every ${intervalMins} minutes.\n`,
    );
    return;
  }

  print("\n  \x1b[1;36m✦ Lyra Sync Daemon\x1b[0m\n");

  print(
    `  \x1b[32m✔\x1b[0m Daemon started. Syncing every ${intervalMins} minutes.`,
  );
  print("  \x1b[90mPress Ctrl+C to stop.\x1b[0m\n");

  if (!config.autoSyncEnabled) {
    config.autoSyncEnabled = true;
  }

  startAutoSyncScheduler();

  return new Promise((resolve) => {
    const shutdown = () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      print("\n  \x1b[33mStopping Lyra Sync Daemon...\x1b[0m");
      stopAutoSyncScheduler();
      print("  \x1b[32m✔\x1b[0m Daemon stopped gracefully.");
      resolve();
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

export async function syncAction(
  options: {
    pull?: boolean;
    push?: boolean;
    daemon?: boolean;
    dryRun?: boolean;
  } = {},
): Promise<void> {
  const selectedOperations = [
    options.pull,
    options.push,
    options.daemon,
  ].filter(Boolean).length;
  if (selectedOperations > 1) {
    throw new Error("Use only one of --pull, --push, or --daemon.");
  }

  if (options.daemon) {
    await daemonAction(options);
    return;
  }

  const git = getGitService();
  const isRepo = await git.isGitRepo();

  if (!isRepo) {
    printError(
      "\x1b[31mError:\x1b[0m Not a git repository. Initialize git in your vault first.",
    );
    process.exitCode = 1;
    return;
  }

  const doPull = !options.push;
  const doPush = !options.pull;

  if (options.dryRun) {
    const operations = [
      doPull && "pull from Git remote",
      doPush && "push to Git remote",
    ]
      .filter(Boolean)
      .join(", ");
    print(`\n  \x1b[33mDry run:\x1b[0m would ${operations}.\n`);
    return;
  }

  print("\n  \x1b[1;35m✦ Lyra Sync\x1b[0m\n");

  try {
    if (doPull) {
      write("  ↓ Pulling latest changes from remote... ");
      const pullRes = await git.pull();
      print(`\x1b[32m✔\x1b[0m \x1b[90m(${pullRes || "Up to date"})\x1b[0m`);
    }

    if (doPush) {
      write("  ↑ Pushing local changes to remote... ");
      const pushRes = await git.push();
      print(`\x1b[32m✔\x1b[0m \x1b[90m(${pushRes || "Pushed"})\x1b[0m`);
    }

    print("\n  \x1b[32m✔ Synchronization completed successfully.\x1b[0m\n");
  } catch (err: any) {
    printError(
      `\x1b[31m✖\x1b[0m\n\n  \x1b[31mSynchronization error:\x1b[0m ${err.message}\n`,
    );
    process.exitCode = 1;
  }
}

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Synchronize Git remote repository")
    .option("--pull", "Pull latest changes from remote Git repository only")
    .option("--push", "Push local changes to remote Git repository only")
    .option("-d, --daemon", "Run as persistent background daemon")
    .option("--dry-run", "Show synchronization actions without running them")
    .action(async (options) => {
      await syncAction(options);
    });

  program
    .command("daemon")
    .description("Start persistent background auto-sync daemon")
    .option("--dry-run", "Show the daemon action without starting it")
    .action(async (options) => {
      await daemonAction(options);
    });
}
