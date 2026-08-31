import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const helpers = vi.hoisted(() => ({
  ensureDirs: vi.fn(),
  getConfig: vi.fn(),
  getGitService: vi.fn(),
  getEmbeddingService: vi.fn(),
}));
const scheduler = vi.hoisted(() => ({
  startAutoSyncScheduler: vi.fn(),
  stopAutoSyncScheduler: vi.fn(),
}));

vi.mock("../src/helpers", () => helpers);
vi.mock("../src/services/auto-sync", () => scheduler);

import { runCli } from "../src/cli";
import { daemonAction, syncAction } from "../src/cli/commands/sync";

describe("sync CLI command", () => {
  const isGitRepo = vi.fn();
  const pull = vi.fn();
  const push = vi.fn();
  const embeddingInit = vi.fn();
  const syncIndex = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    helpers.ensureDirs.mockResolvedValue(undefined);
    helpers.getConfig.mockReturnValue({
      autoSyncEnabled: true,
      autoSyncIntervalMins: 5,
    });
    helpers.getGitService.mockReturnValue({ isGitRepo, pull, push });
    helpers.getEmbeddingService.mockReturnValue({
      init: embeddingInit,
      syncIndex,
    });
    isGitRepo.mockResolvedValue(true);
    pull.mockResolvedValue("Already up to date.");
    push.mockResolvedValue("Pushed");
    embeddingInit.mockResolvedValue(undefined);
    syncIndex.mockResolvedValue({ indexedCount: 3 });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("runs pull and push when no limiting flag is supplied", async () => {
    await syncAction();

    expect(pull).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(embeddingInit).not.toHaveBeenCalled();
    expect(syncIndex).not.toHaveBeenCalled();
  });

  it("parses --pull and only pulls through the CLI entry point", async () => {
    await expect(runCli(["sync", "--pull"])).resolves.toBe(true);

    expect(helpers.ensureDirs).toHaveBeenCalledTimes(1);
    expect(pull).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(syncIndex).not.toHaveBeenCalled();
  });

  it("runs only push with --push", async () => {
    await syncAction({
      push: true,
    });

    expect(pull).toHaveBeenCalledTimes(0);
    expect(push).toHaveBeenCalledTimes(1);
    expect(syncIndex).not.toHaveBeenCalled();
  });

  it("rejects multiple limiting flags instead of reporting success without syncing", async () => {
    await expect(syncAction({ pull: true, push: true })).rejects.toThrow(
      "Use only one of --pull, --push, or --daemon.",
    );

    expect(pull).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(syncIndex).not.toHaveBeenCalled();
  });

  it("does not perform sync work in dry-run mode", async () => {
    await syncAction({ dryRun: true });

    expect(pull).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(syncIndex).not.toHaveBeenCalled();
  });

  it("does not push after pull reports a conflict", async () => {
    pull.mockRejectedValue(new Error("merge conflict"));

    await syncAction();

    expect(push).not.toHaveBeenCalled();
    expect(syncIndex).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("removes daemon signal handlers after graceful shutdown", async () => {
    const sigintListeners = process.listenerCount("SIGINT");
    const sigtermListeners = process.listenerCount("SIGTERM");

    const daemon = daemonAction();
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduler.startAutoSyncScheduler).toHaveBeenCalledTimes(1);

    process.emit("SIGINT");
    await daemon;

    expect(scheduler.stopAutoSyncScheduler).toHaveBeenCalledTimes(1);
    expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
    expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners);
  });
});
