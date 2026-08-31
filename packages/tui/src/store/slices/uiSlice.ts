import type { StateCreator } from "zustand";
import type {
  AppStoreState,
  UiSlice,
  FolderModalType,
  NoteModalType,
  BootStepId,
  BootStepStatus,
  BootSteps,
} from "../types";
import { t, I18N_KEYS } from "../../i18n";
import { setActiveTheme, getActiveTheme, registerTheme } from "../../theme";
import type { Theme } from "../../theme/types";
import { copyTextToClipboard } from "../../clipboard";

let copyTimer: ReturnType<typeof setTimeout> | null = null;

export const createUiSlice: StateCreator<AppStoreState, [], [], UiSlice> = (
  set,
  get,
) => ({
  themeId: "dark",
  activeTheme: getActiveTheme(),
  themeVersion: 0,
  statusMessage: t(I18N_KEYS.STATUS_READY),
  repoPath: "",
  isCommandPaletteOpen: false,
  isHelpOpen: false,
  folderModal: { type: null },
  noteModal: { type: null },
  linkModalOpen: false,
  isNoteHistoryOpen: false,
  isLocalGraphOpen: false,
  isWikilinkPickerOpen: false,
  isAiModalOpen: false,
  isAttachFileModalOpen: false,
  isAttachmentsListOpen: false,
  copyPopup: {
    visible: false,
    message: "",
  },
  isBooting: true,
  bootSteps: {
    folders: "pending",
    notes: "pending",
    myday: "pending",
    todos: "pending",
    links: "pending",
    graph: "pending",
  } as BootSteps,

  setBootStep: (step: BootStepId, status: BootStepStatus) => {
    set((state) => ({
      bootSteps: { ...state.bootSteps, [step]: status },
    }));
  },

  finishBoot: () => {
    set({ isBooting: false });
  },

  setTheme: (themeId: string, customTheme?: Theme) => {
    if (customTheme) {
      registerTheme(customTheme);
    }
    const t = setActiveTheme(themeId);
    set((state) => ({
      themeId,
      activeTheme: t,
      themeVersion: state.themeVersion + 1,
    }));
  },

  setStatusMessage: (msg: string) => {
    set({ statusMessage: msg });
  },

  setRepoPath: (path: string) => {
    set({ repoPath: path });
  },

  setCommandPaletteOpen: (open: boolean) => {
    set({ isCommandPaletteOpen: open });
  },

  setHelpOpen: (open: boolean) => {
    set({ isHelpOpen: open });
  },

  setLinkModalOpen: (open: boolean) => {
    set({ linkModalOpen: open });
  },

  setNoteHistoryOpen: (open: boolean) => {
    set({ isNoteHistoryOpen: open });
  },

  setLocalGraphOpen: (open: boolean) => {
    set({ isLocalGraphOpen: open });
  },

  setWikilinkPickerOpen: (open: boolean) => {
    set({ isWikilinkPickerOpen: open });
  },

  setAiModalOpen: (open: boolean) => {
    set({ isAiModalOpen: open });
  },

  setAttachFileModalOpen: (open: boolean) => {
    set({ isAttachFileModalOpen: open });
  },

  setAttachmentsListOpen: (open: boolean) => {
    set({ isAttachmentsListOpen: open });
  },

  openFolderModal: (type: FolderModalType, targetFolder?: string) => {
    set({ folderModal: { type, targetFolder } });
  },

  closeFolderModal: () => {
    set({ folderModal: { type: null } });
  },

  openNoteModal: (
    type: NoteModalType,
    noteInfo?: { folderName: string; filename: string; title: string },
  ) => {
    set({
      noteModal: {
        type,
        targetFolder: noteInfo?.folderName,
        targetFilename: noteInfo?.filename,
        targetTitle: noteInfo?.title,
      },
    });
  },

  closeNoteModal: () => {
    set({ noteModal: { type: null } });
  },

  showCopyPopup: (customMessage?: string) => {
    if (copyTimer) {
      clearTimeout(copyTimer);
    }
    const message = customMessage || t(I18N_KEYS.POPUP_COPIED);
    set({
      copyPopup: {
        visible: true,
        message,
      },
    });
    copyTimer = setTimeout(() => {
      set((state) => ({
        copyPopup: { ...state.copyPopup, visible: false },
      }));
    }, 2000);
  },

  copyToClipboard: async (
    text: string,
    customMessage?: string,
    showPopup = true,
  ): Promise<boolean> => {
    if (!text) return false;
    const ok = await copyTextToClipboard(text);
    if (!ok) return false;

    const msg = customMessage || t(I18N_KEYS.POPUP_COPIED);
    if (showPopup) get().showCopyPopup(msg);
    set({ statusMessage: msg });
    return ok;
  },
});
