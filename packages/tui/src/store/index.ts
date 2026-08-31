import { create } from "zustand";
import type { AppStoreState } from "./types";
import { createNavigationSlice } from "./slices/navigationSlice";
import { createUiSlice } from "./slices/uiSlice";
import { createFoldersNotesSlice } from "./slices/foldersNotesSlice";
import { createTodosLinksMyDaySlice } from "./slices/todosLinksMyDaySlice";
import { createGraphSlice } from "./slices/graphSlice";
import {
  getRepoPath,
  getConfig,
  listMyDayNotes,
  getLocalDateString,
} from "@lyratui/core";
import { setLocale, t, I18N_KEYS } from "../i18n";
import type { BootStepId, BootStepStatus } from "./types";
import {
  isOmarchyEnvironment,
  ensureOmarchyTemplateInstalled,
  loadOmarchyTheme,
  registerTheme,
  watchOmarchyTheme,
} from "../theme";

let omarchyWatcherUnsub: (() => void) | null = null;

export function disposeAppCleanup(): void {
  if (omarchyWatcherUnsub) {
    try {
      omarchyWatcherUnsub();
    } catch {
      // ignore
    }
    omarchyWatcherUnsub = null;
  }
}

export const useAppStore = create<AppStoreState>()((set, get, store) => ({
  ...createNavigationSlice(set, get, store),
  ...createUiSlice(set, get, store),
  ...createFoldersNotesSlice(set, get, store),
  ...createTodosLinksMyDaySlice(set, get, store),
  ...createGraphSlice(set, get, store),

  refreshAll: async () => {
    set({ repoPath: getRepoPath() });
    const mark = (step: BootStepId, status: BootStepStatus) => {
      if (get().isBooting) get().setBootStep(step, status);
    };

    mark("folders", "running");
    await get().loadFoldersList();
    mark("folders", "done");

    mark("notes", "running");
    await get().loadNotesForFolder(get().activeFolder);
    mark("notes", "done");

    mark("myday", "running");
    try {
      const m = await listMyDayNotes();
      set({ myDayNotes: m });
    } catch (err) {
      console.error("Failed to list MyDay notes during refreshAll:", err);
    }
    mark("myday", "done");

    mark("todos", "running");
    await get().refreshTodos();
    mark("todos", "done");

    mark("links", "running");
    await get().refreshLinks();
    mark("links", "done");

    mark("graph", "running");
    await get().refreshGraph();
    mark("graph", "done");

    get().setStatusMessage(t(I18N_KEYS.STATUS_SYNCHRONIZED));
  },

  initializeAppFast: async () => {
    try {
      if (isOmarchyEnvironment()) {
        ensureOmarchyTemplateInstalled();
        const omarchyTheme = loadOmarchyTheme();
        if (omarchyTheme) {
          registerTheme(omarchyTheme);
        }
      }

      const cfg = await getConfig();
      if (cfg.language) {
        setLocale(cfg.language);
      }
      if ((cfg as any).theme) {
        get().setTheme((cfg as any).theme);
      } else if (isOmarchyEnvironment()) {
        get().setTheme("omarchy");
      }

      if (isOmarchyEnvironment()) {
        if (omarchyWatcherUnsub) {
          omarchyWatcherUnsub();
        }
        omarchyWatcherUnsub = watchOmarchyTheme((updatedTheme) => {
          registerTheme(updatedTheme);
          if (get().themeId === "omarchy") {
            get().setTheme("omarchy", updatedTheme);
          }
        });
      }
    } catch (err) {
      console.error("Failed to load config during initializeApp:", err);
    }
  },

  initializeApp: async () => {
    await get().initializeAppFast();
    await get().refreshAll();
    await get().openMyDayDate(getLocalDateString());
    get().finishBoot();
  },
}));

export * from "./types";
