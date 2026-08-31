import {
  getGitService,
  getEmbeddingService,
  getConfig,
  shouldIndexInBackground,
} from "../helpers";

let syncInterval: NodeJS.Timeout | null = null;
let initialSyncTimeout: NodeJS.Timeout | null = null;
let isSyncing = false;

export async function runAutoSync(): Promise<void> {
  if (isSyncing) return;

  const config = getConfig();
  if (!config.autoSyncEnabled) return;

  const git = getGitService();
  const hasRemote = await git.getRemote();
  if (!hasRemote) return;

  isSyncing = true;
  console.log("Background Auto-Sync: Starting sync...");

  try {
    console.log("Background Auto-Sync: Pulling from remote...");
    await git.pull();

    console.log("Background Auto-Sync: Pushing to remote...");
    await git.push();

    if (shouldIndexInBackground()) {
      console.log("Background Auto-Sync: Syncing embeddings index...");
      const embedding = getEmbeddingService();
      await embedding.init();
      const stats = await embedding.syncIndex();
      console.log(
        `Background Auto-Sync: Index synced. ${stats.indexedCount} notes updated.`,
      );
    }
  } catch (err) {
    console.error("Background Auto-Sync failed:", err);
  } finally {
    isSyncing = false;
  }
}

export function startAutoSyncScheduler(): void {
  stopAutoSyncScheduler();

  const config = getConfig();
  if (!config.autoSyncEnabled) {
    console.log("Background Auto-Sync is disabled.");
    return;
  }

  const intervalMins = config.autoSyncIntervalMins || 5;
  console.log(
    `Background Auto-Sync enabled. Scheduled every ${intervalMins} minutes.`,
  );

  initialSyncTimeout = setTimeout(() => {
    initialSyncTimeout = null;
    runAutoSync().catch(console.error);
  }, 10000);

  syncInterval = setInterval(
    () => {
      runAutoSync().catch(console.error);
    },
    intervalMins * 60 * 1000,
  );
}

export function stopAutoSyncScheduler(): void {
  if (initialSyncTimeout) {
    clearTimeout(initialSyncTimeout);
    initialSyncTimeout = null;
  }
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
