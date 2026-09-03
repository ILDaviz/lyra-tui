import React from "react";
import {
  createCliRenderer,
  getTreeSitterClient,
  destroyTreeSitterClient,
} from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { registerCommaBindings } from "@opentui/keymap/addons";
import { registerManagedTextareaLayer } from "@opentui/keymap/addons/opentui";
import { KeymapProvider } from "@opentui/keymap/react";
import { useAppStore, disposeAppCleanup } from "./store";
import { AppContent } from "./App";
import {
  ensureDirs,
  getEmbeddingService,
  getLocalDateString,
  flushLogsSync,
  initTuiLogging,
  stopAutoSyncScheduler,
} from "@lyratui/core";
import { initializeClipboard } from "./clipboard";
import { t, I18N_KEYS } from "./i18n";

export async function runTui() {
  // OpenTUI hijacks console.* for its internal console viewer, which would
  // swallow the file logger's output. We route everything to the log file.
  process.env.OTUI_USE_CONSOLE = "0";

  initTuiLogging();
  await ensureDirs();

  try {
    const tsClient = getTreeSitterClient();
    void Promise.resolve(tsClient.initialize()).catch((err) => {
      console.error("Failed to initialize Tree-sitter client:", err);
    });
  } catch (err) {
    console.error("Failed to initialize Tree-sitter client:", err);
  }

  await useAppStore.getState().initializeAppFast();

  const renderer = await createCliRenderer({
    // Ctrl+C is a native editor copy shortcut on Linux and must reach Keymap.
    exitOnCtrlC: false,
  });
  // 17+ components register useKeyboard listeners on the shared keyHandler;
  // Node's default warning threshold (10) fires during normal multi-view
  // rendering even though every listener is removed on unmount.
  renderer.keyInput.setMaxListeners(50);
  const disposeClipboard = initializeClipboard(renderer);
  const keymap = createDefaultOpenTuiKeymap(renderer);
  registerCommaBindings(keymap);
  const disposeTextareaLayer = registerManagedTextareaLayer(keymap, renderer, {
    priority: 0,
  });

  const originalDestroy = renderer.destroy.bind(renderer);
  renderer.destroy = () => {
    disposeAppCleanup();
    stopAutoSyncScheduler();
    disposeTextareaLayer();
    originalDestroy();
    const cleanup = Promise.all([
      disposeClipboard().catch((err) => {
        console.error("Failed to dispose clipboard service:", err);
      }),
      destroyTreeSitterClient().catch((err) => {
        console.error("Failed to destroy Tree-sitter client:", err);
      }),
      getEmbeddingService()
        .dispose()
        .catch((err) => {
          console.error("Failed to dispose embedding service:", err);
        }),
    ]);
    // The embedding dispose checkpoints and closes the SQLite handle (the
    // worker path is bounded internally); give it room before exiting.
    Promise.race([cleanup, new Promise((resolve) => setTimeout(resolve, 2500))])
      .catch(() => {})
      .finally(() => {
        flushLogsSync();
        process.exit(0);
      });
  };

  const root = createRoot(renderer);
  root.render(
    <KeymapProvider keymap={keymap}>
      <AppContent />
    </KeymapProvider>,
  );

  void (async () => {
    try {
      const store = useAppStore.getState();
      await store.refreshAll();
      await store.openMyDayDate(getLocalDateString());
      useAppStore.getState().finishBoot();

      // Delay background indexing so early keystrokes stay responsive.
      setTimeout(() => {
        useAppStore.getState().setIndexSyncing(true);
        useAppStore.getState().setStatusMessage(t(I18N_KEYS.STATUS_INDEXING));
        getEmbeddingService()
          .syncIndex()
          .catch((err) => {
            console.error(
              "Failed to synchronize the embeddings index on startup:",
              err,
            );
          })
          .finally(() => {
            useAppStore.getState().setIndexSyncing(false);
            useAppStore.getState().setStatusMessage(t(I18N_KEYS.STATUS_READY));
          });
      }, 4000);
    } catch (err) {
      console.error("Failed to initialize app data:", err);
      useAppStore.getState().finishBoot();
    }
  })();

  return renderer;
}

export * from "./App";
export * from "./store";
export * from "./types";
export * from "./i18n";
