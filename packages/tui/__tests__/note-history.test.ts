import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { useAppStore } from "../src/store";
import {
  getRepoPath,
  writeNote,
  createFolder,
  deleteFolder,
  getGitService,
  readNote,
} from "@lyratui/core";
import { t, setLocale, getLocale, I18N_KEYS } from "../src/i18n";

describe("Note History & Version Control Integration", () => {
  let repoPath = "";

  beforeEach(async () => {
    repoPath = getRepoPath();
    await fs.mkdir(repoPath, { recursive: true });

    useAppStore.setState({
      viewMode: "notes",
      activePane: "editor",
      isEditing: false,
      statusMessage: "Ready",
      isCommandPaletteOpen: false,
      isHelpOpen: false,
      folderModal: { type: null },
      noteModal: { type: null },
      linkModalOpen: false,
      isNoteHistoryOpen: false,
      folders: ["/"],
      activeFolder: "/",
      notes: [],
      selectedNoteIndex: 0,
      activeNote: null,
    });
  });

  afterEach(async () => {
    await fs
      .rm(path.join(repoPath, "HistoryStoreFolder"), {
        recursive: true,
        force: true,
      })
      .catch(() => {});
  });

  describe("i18n Keys for Note History", () => {
    it("should have all history keys defined in I18N_KEYS", () => {
      expect(I18N_KEYS.EDITOR_HISTORY_TITLE).toBeDefined();
      expect(I18N_KEYS.EDITOR_HISTORY_EMPTY).toBeDefined();
      expect(I18N_KEYS.EDITOR_HISTORY_PREVIEW).toBeDefined();
      expect(I18N_KEYS.EDITOR_HISTORY_RESTORE_BTN).toBeDefined();
      expect(I18N_KEYS.EDITOR_HISTORY_RESTORE_CONFIRM).toBeDefined();
      expect(I18N_KEYS.EDITOR_HISTORY_RESTORE_SUCCESS).toBeDefined();
      expect(I18N_KEYS.EDITOR_HISTORY_RESTORE_FAILED).toBeDefined();
      expect(I18N_KEYS.EDITOR_HISTORY_GIT_MISSING).toBeDefined();
      expect(I18N_KEYS.EDITOR_HISTORY_SELECT_HINT).toBeDefined();
      expect(I18N_KEYS.EDITOR_HISTORY_BADGE).toBeDefined();
      expect(I18N_KEYS.CMD_NOTE_HISTORY).toBeDefined();
      expect(I18N_KEYS.HELP_DESC_EDITOR_HISTORY).toBeDefined();
    });

    it("should return English translations by default", () => {
      setLocale("en");
      expect(t(I18N_KEYS.EDITOR_HISTORY_TITLE)).toContain("Note History");
      expect(t(I18N_KEYS.EDITOR_HISTORY_PREVIEW)).toContain("Preview");
      expect(t(I18N_KEYS.EDITOR_HISTORY_RESTORE_BTN)).toContain("Restore");
      expect(t(I18N_KEYS.CMD_NOTE_HISTORY)).toBe("View Note History");
    });

    it("should return Italian translations when switched to Italian", () => {
      setLocale("it");
      expect(t(I18N_KEYS.EDITOR_HISTORY_TITLE)).toContain("Cronologia");
      expect(t(I18N_KEYS.EDITOR_HISTORY_PREVIEW)).toContain("Anteprima");
      expect(t(I18N_KEYS.EDITOR_HISTORY_RESTORE_BTN)).toContain("Ripristina");
      expect(t(I18N_KEYS.CMD_NOTE_HISTORY)).toContain("Cronologia");
      setLocale("en");
    });

    it("should interpolate hash and date parameters in restore messages", () => {
      setLocale("en");
      const msg = t(I18N_KEYS.EDITOR_HISTORY_RESTORE_CONFIRM, {
        hash: "abc1234",
        date: "2026-08-21",
      });
      expect(msg).toContain("abc1234");
      expect(msg).toContain("2026-08-21");
    });
  });

  describe("Zustand UI & History State", () => {
    it("should toggle isNoteHistoryOpen state", () => {
      const store = useAppStore.getState();
      expect(store.isNoteHistoryOpen).toBe(false);

      store.setNoteHistoryOpen(true);
      expect(useAppStore.getState().isNoteHistoryOpen).toBe(true);

      store.setNoteHistoryOpen(false);
      expect(useAppStore.getState().isNoteHistoryOpen).toBe(false);
    });
  });

  describe("Git History Actions and Version Restore", () => {
    it("should detect git availability and fetch history revisions", async () => {
      const git = getGitService();
      await git.init();

      await createFolder("HistoryStoreFolder");
      const filename = "meeting-notes.md";

      await writeNote({
        folderName: "HistoryStoreFolder",
        filename,
        content: "# Meeting Notes\n\nAgenda item 1: Introduction",
      });
      await git.commit(
        `docs(notes): update note "${filename}"`,
        `HistoryStoreFolder/${filename}`,
      );

      await writeNote({
        folderName: "HistoryStoreFolder",
        filename,
        content:
          "# Meeting Notes\n\nAgenda item 1: Introduction\nAgenda item 2: Q&A",
      });
      await git.commit(
        `docs(notes): update note "${filename}"`,
        `HistoryStoreFolder/${filename}`,
      );

      const store = useAppStore.getState();
      const isGitActive = await store.isGitActiveAction();
      expect(isGitActive).toBe(true);

      const history = await store.getNoteHistoryAction(
        "HistoryStoreFolder",
        filename,
      );
      expect(history.length).toBeGreaterThanOrEqual(2);

      const oldestCommit = history[history.length - 1];
      const preview = await store.getNoteContentAtCommitAction(
        "HistoryStoreFolder",
        filename,
        oldestCommit.hash,
      );
      expect(preview).toContain("Agenda item 1: Introduction");
      expect(preview).not.toContain("Agenda item 2: Q&A");

      useAppStore.setState({
        activeFolder: "HistoryStoreFolder",
        activeNote: {
          folderName: "HistoryStoreFolder",
          filename,
          title: "Meeting Notes",
          content:
            "# Meeting Notes\n\nAgenda item 1: Introduction\nAgenda item 2: Q&A",
          isDirty: false,
        },
      });

      const restoreSuccess = await store.restoreNoteVersionAction(
        "HistoryStoreFolder",
        filename,
        oldestCommit.hash,
      );
      expect(restoreSuccess).toBe(true);

      const updatedActive = useAppStore.getState().activeNote;
      expect(updatedActive?.content).toContain("Agenda item 1: Introduction");
      expect(updatedActive?.content).not.toContain("Agenda item 2: Q&A");
      expect(updatedActive?.isDirty).toBe(false);

      const diskNote = await readNote("HistoryStoreFolder", filename);
      expect(diskNote.content).toContain("Agenda item 1: Introduction");
      expect(diskNote.content).not.toContain("Agenda item 2: Q&A");

      await deleteFolder("HistoryStoreFolder").catch(() => {});
    });
  });
});
