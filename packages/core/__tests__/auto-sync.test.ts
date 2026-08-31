import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const helpers = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getGitService: vi.fn(),
  getEmbeddingService: vi.fn(),
  shouldIndexInBackground: vi.fn(),
}));

vi.mock("../src/helpers", () => helpers);

import {
  runAutoSync,
  startAutoSyncScheduler,
  stopAutoSyncScheduler,
} from "../src/services/auto-sync";

describe("AutoSync Service", () => {
  const pull = vi.fn();
  const push = vi.fn();
  const getRemote = vi.fn();
  const embeddingInit = vi.fn();
  const syncIndex = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    helpers.shouldIndexInBackground.mockReturnValue(true);
    helpers.getConfig.mockReturnValue({
      autoSyncEnabled: true,
      autoSyncIntervalMins: 5,
    });
    helpers.getGitService.mockReturnValue({ getRemote, pull, push });
    helpers.getEmbeddingService.mockReturnValue({
      init: embeddingInit,
      syncIndex,
    });
    getRemote.mockResolvedValue("/tmp/lyra-remote.git");
    pull.mockResolvedValue("");
    push.mockResolvedValue("");
    embeddingInit.mockResolvedValue(undefined);
    syncIndex.mockResolvedValue({ indexedCount: 2 });
  });

  afterEach(() => {
    stopAutoSyncScheduler();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not sync when auto-sync is disabled", async () => {
    helpers.getConfig.mockReturnValue({ autoSyncEnabled: false });

    await expect(runAutoSync()).resolves.toBeUndefined();
    expect(getRemote).not.toHaveBeenCalled();
  });

  it("pulls, pushes, then refreshes the semantic index", async () => {
    const callOrder: string[] = [];
    pull.mockImplementation(async () => callOrder.push("pull"));
    push.mockImplementation(async () => callOrder.push("push"));
    embeddingInit.mockImplementation(async () => callOrder.push("init"));
    syncIndex.mockImplementation(async () => {
      callOrder.push("index");
      return { indexedCount: 2 };
    });

    await runAutoSync();

    expect(callOrder).toEqual(["pull", "push", "init", "index"]);
  });

  it("does not push or index after a pull failure", async () => {
    pull.mockRejectedValue(new Error("merge conflict"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(runAutoSync()).resolves.toBeUndefined();

    expect(push).not.toHaveBeenCalled();
    expect(embeddingInit).not.toHaveBeenCalled();
    expect(syncIndex).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });

  it("prevents overlapping runs and releases the lock after completion", async () => {
    let resolvePull: (() => void) | undefined;
    pull
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolvePull = resolve;
          }),
      )
      .mockResolvedValueOnce("");

    const firstRun = runAutoSync();
    await Promise.resolve();
    await Promise.resolve();
    expect(pull).toHaveBeenCalledTimes(1);

    await runAutoSync();
    expect(pull).toHaveBeenCalledTimes(1);

    resolvePull?.();
    await firstRun;
    await runAutoSync();
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it("cancels both the initial delayed sync and the recurring scheduler", async () => {
    startAutoSyncScheduler();
    stopAutoSyncScheduler();

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

    expect(pull).not.toHaveBeenCalled();
  });

  it("runs the initial scheduled sync once", async () => {
    startAutoSyncScheduler();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(pull).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(syncIndex).toHaveBeenCalledTimes(1);
  });
});
