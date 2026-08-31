import { StateCreator } from "zustand";
import { spawnSync } from "child_process";
import * as fs from "fs/promises";
import type { AppStoreState, FoldersNotesSlice } from "../types";
import type { TuiNoteMetadata } from "../../types";
import { t, I18N_KEYS } from "../../i18n";
import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  listNotes,
  readNote,
  writeNote,
  deleteNote,
  moveNote,
  isGitActive,
  getNoteHistory,
  getNoteContentAtCommit,
  restoreNoteVersion,
  resolveNotePath,
  backgroundCommit,
  getEmbeddingService,
  ensureDirs,
  getRelativePath,
  shouldIndexInBackground,
} from "@lyratui/core";

export const createFoldersNotesSlice: StateCreator<
  AppStoreState,
  [],
  [],
  FoldersNotesSlice
> = (set, get) => ({
  folders: ["/"],
  activeFolder: "/",
  notes: [],
  selectedNoteIndex: 0,
  activeNote: null,
  notesRequestId: 0,

  setSelectedNoteIndex: (index: number | ((prev: number) => number)) => {
    set((state) => ({
      selectedNoteIndex:
        typeof index === "function" ? index(state.selectedNoteIndex) : index,
    }));
  },

  loadFoldersList: async () => {
    try {
      const f = await listFolders();
      set({ folders: ["/", ...f] });
    } catch (err: any) {
      console.error("Failed to load folders list:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_LOADING_FOLDERS, { error: err.message }),
      );
    }
  },

  loadNotesForFolder: async (folder: string) => {
    const currentRequestId = get().notesRequestId + 1;
    set({ notesRequestId: currentRequestId });

    try {
      const n = await listNotes(folder);
      if (get().notesRequestId !== currentRequestId) return;

      set({ notes: n, selectedNoteIndex: 0 });

      if (n.length > 0) {
        const first = n[0];
        const res = await readNote(folder, first.filename);
        if (get().notesRequestId !== currentRequestId) return;

        if (res.success && typeof res.content === "string") {
          set({
            activeNote: {
              folderName: folder,
              filename: first.filename,
              title: first.title,
              content: res.content,
              updatedAt: first.updatedAt,
              isDirty: false,
            },
          });
        }
      } else {
        set({ activeNote: null });
      }
    } catch (err: any) {
      console.error("Failed to load notes for folder:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_LOADING_NOTES, { error: err.message }),
      );
    }
  },

  selectFolder: async (folder: string) => {
    set({ activeFolder: folder, viewMode: "notes" });
    await get().loadNotesForFolder(folder);
    get().setStatusMessage(t(I18N_KEYS.STATUS_FOLDER_SELECTED, { folder }));
  },

  openNote: async (note: TuiNoteMetadata, folderName?: string) => {
    const targetFolder = folderName || get().activeFolder;
    try {
      const res = await readNote(targetFolder, note.filename);
      if (res.success && typeof res.content === "string") {
        set({
          activeNote: {
            folderName: targetFolder,
            filename: note.filename,
            title: note.title,
            content: res.content,
            updatedAt: note.updatedAt,
            isDirty: false,
          },
        });
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_NOTE_OPENED, { title: note.title }),
        );
      }
    } catch (err: any) {
      console.error("Failed to open note:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_READING_NOTE, { error: err.message }),
      );
    }
  },

  saveNoteContent: async (content: string) => {
    const active = get().activeNote;
    if (!active) return;
    try {
      const res = await writeNote({
        folderName: active.folderName,
        filename: active.filename,
        content,
      });
      if (res.success) {
        set((state) => ({
          activeNote: state.activeNote
            ? {
                ...state.activeNote,
                content,
                isDirty: false,
                updatedAt: res.updatedAt,
              }
            : null,
        }));
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_NOTE_SAVED_NAME, { filename: active.filename }),
        );
        const n = await listNotes(active.folderName);
        set({ notes: n });
        get().rescanFileDerived(active.folderName, active.filename);
      }
    } catch (err: any) {
      console.error("Failed to save note content:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_SAVING_NOTE, { error: err.message }),
      );
    }
  },

  markNoteDirty: () => {
    set((state) => ({
      activeNote:
        state.activeNote && !state.activeNote.isDirty
          ? { ...state.activeNote, isDirty: true }
          : state.activeNote,
    }));
  },

  createNewNote: async (title?: string) => {
    const activeFolder = get().activeFolder;
    try {
      const baseTitle =
        title ||
        t(I18N_KEYS.STATUS_NOTE_CREATED_UNTITLED, {
          id: Date.now().toString().slice(-4),
        });
      const filename = `${baseTitle}.md`;
      const initialContent = `# ${baseTitle}\n\n`;
      const res = await writeNote({
        folderName: activeFolder,
        filename,
        content: initialContent,
      });
      if (res.success) {
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_NOTE_SAVED_NAME, { filename }),
        );
        await get().loadNotesForFolder(activeFolder);
        set({
          activeNote: {
            folderName: activeFolder,
            filename: res.filename || filename,
            title: res.title || baseTitle,
            content: initialContent,
            updatedAt: res.updatedAt,
            isDirty: false,
          },
          activePane: "editor",
        });
      }
    } catch (err: any) {
      console.error("Failed to create new note:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_CREATING_NOTE, { error: err.message }),
      );
    }
  },

  deleteCurrentNote: async () => {
    const active = get().activeNote;
    if (!active) return;
    try {
      const res = await deleteNote(active.folderName, active.filename);
      if (res.success) {
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_ERROR_DELETING_NOTE, { title: active.filename }),
        );
        await get().loadNotesForFolder(active.folderName);
      }
    } catch (err: any) {
      console.error("Failed to delete current note:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_FAILED_DELETE_NOTE, { error: err.message }),
      );
    }
  },

  deleteNoteAction: async (
    folderName: string,
    filename: string,
  ): Promise<boolean> => {
    try {
      const res = await deleteNote(folderName, filename);
      if (res.success) {
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_ERROR_DELETING_NOTE, { title: filename }),
        );
        await get().loadNotesForFolder(folderName);
        return true;
      } else {
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_FAILED_DELETE_NOTE, { error: res.error }),
        );
        return false;
      }
    } catch (err: any) {
      console.error("Failed to delete note:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_FAILED_DELETE_NOTE, { error: err.message }),
      );
      return false;
    }
  },

  moveNoteAction: async (
    folderName: string,
    filename: string,
    targetFolderName: string,
  ): Promise<boolean> => {
    try {
      if (folderName === targetFolderName) {
        get().setStatusMessage(t(I18N_KEYS.STATUS_NOTE_ALREADY_IN_FOLDER));
        return true;
      }
      const res = await moveNote(folderName, filename, targetFolderName);
      if (res.success) {
        const rootLabel = t(I18N_KEYS.HEADER_BREADCRUMB_ROOT);
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_NOTE_MOVED, {
            note: filename,
            folder: targetFolderName === "/" ? rootLabel : targetFolderName,
          }),
        );
        await get().loadNotesForFolder(get().activeFolder);
        return true;
      } else {
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_FAILED_MOVE_NOTE, { error: res.error }),
        );
        return false;
      }
    } catch (err: any) {
      console.error("Failed to move note:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_MOVING_NOTE, { error: err.message }),
      );
      return false;
    }
  },

  createFolderAction: async (name: string): Promise<boolean> => {
    try {
      const res = await createFolder(name);
      if (res.success) {
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_FOLDER_CREATED, { folder: name }),
        );
        await get().loadFoldersList();
        await get().selectFolder(name);
        return true;
      } else {
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_FAILED_ACTION, { error: res.error }),
        );
        return false;
      }
    } catch (err: any) {
      console.error("Failed to create folder:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_CREATING_FOLDER, { error: err.message }),
      );
      return false;
    }
  },

  renameFolderAction: async (
    oldName: string,
    newName: string,
  ): Promise<boolean> => {
    try {
      const res = await renameFolder(oldName, newName);
      if (res.success) {
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_FOLDER_RENAMED, { old: oldName, new: newName }),
        );
        await get().loadFoldersList();
        if (get().activeFolder === oldName) {
          await get().selectFolder(newName);
        }
        return true;
      } else {
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_FAILED_ACTION, { error: res.error }),
        );
        return false;
      }
    } catch (err: any) {
      console.error("Failed to rename folder:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_RENAMING_FOLDER, { error: err.message }),
      );
      return false;
    }
  },

  deleteFolderAction: async (folderName: string): Promise<boolean> => {
    try {
      const res = await deleteFolder(folderName);
      if (res.success) {
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_FOLDER_DELETED, { folder: folderName }),
        );
        await get().loadFoldersList();
        if (get().activeFolder === folderName) {
          await get().selectFolder("/");
        }
        return true;
      } else {
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_FAILED_ACTION, { error: res.error }),
        );
        return false;
      }
    } catch (err: any) {
      console.error("Failed to delete folder:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_DELETING_FOLDER, { error: err.message }),
      );
      return false;
    }
  },

  isGitActiveAction: async (): Promise<boolean> => {
    try {
      return await isGitActive();
    } catch (err) {
      console.error("Failed to check if git is active:", err);
      return false;
    }
  },

  getNoteHistoryAction: async (folderName: string, filename: string) => {
    try {
      return await getNoteHistory(folderName, filename);
    } catch (err: any) {
      console.error("Failed to get note history:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_LOADING_HISTORY, { error: err.message }),
      );
      return [];
    }
  },

  getNoteContentAtCommitAction: async (
    folderName: string,
    filename: string,
    commitHash: string,
  ) => {
    try {
      return await getNoteContentAtCommit(folderName, filename, commitHash);
    } catch (err: any) {
      console.error("Failed to get note content at commit:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_READING_REVISION, { error: err.message }),
      );
      return "";
    }
  },

  restoreNoteVersionAction: async (
    folderName: string,
    filename: string,
    commitHash: string,
  ): Promise<boolean> => {
    try {
      const res = await restoreNoteVersion(folderName, filename, commitHash);
      if (res.success) {
        const currentActive = get().activeNote;
        if (
          currentActive &&
          currentActive.folderName === folderName &&
          currentActive.filename === filename &&
          typeof res.content === "string"
        ) {
          set({
            activeNote: {
              ...currentActive,
              content: res.content,
              isDirty: false,
            },
          });
        }
        await get().loadNotesForFolder(folderName);
        return true;
      } else {
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_FAILED_RESTORE_NOTE, { error: res.error }),
        );
        return false;
      }
    } catch (err: any) {
      console.error("Failed to restore note version:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_RESTORING_NOTE, { error: err.message }),
      );
      return false;
    }
  },

  openInExternalEditor: async (
    renderer?: any,
    noteInfo?: { folderName?: string; filename?: string },
  ): Promise<boolean> => {
    const state = get();
    let folderName = noteInfo?.folderName;
    let filename = noteInfo?.filename;

    if (!folderName || !filename) {
      if (state.activeNote) {
        folderName = state.activeNote.folderName;
        filename = state.activeNote.filename;
      } else if (state.viewMode === "myday" && state.activeMyDayDate) {
        folderName = "myday";
        filename = `${state.activeMyDayDate}.md`;
      } else if (state.notes.length > 0 && state.notes[state.selectedNoteIndex]) {
        const selNote = state.notes[state.selectedNoteIndex];
        folderName = state.activeFolder;
        filename = selNote.filename;
      }
    }

    if (!folderName || !filename) {
      state.setStatusMessage(t(I18N_KEYS.STATUS_EXTERNAL_EDITOR_NO_NOTE));
      return false;
    }

    // Save in-memory note changes if dirty
    if (
      state.activeNote &&
      state.activeNote.folderName === folderName &&
      state.activeNote.filename === filename &&
      state.activeNote.isDirty
    ) {
      await state.saveNoteContent(state.activeNote.content);
    }

    let filePath: string;
    try {
      filePath = resolveNotePath(folderName, filename);
      await ensureDirs();
      try {
        await fs.access(filePath);
      } catch {
        const initialContent =
          folderName === "myday"
            ? `# Daily Log: ${filename.replace(/\.md$/, "")}\n\n`
            : `# ${filename.replace(/\.md$/, "")}\n\n`;
        await writeNote({ folderName, filename, content: initialContent });
      }
    } catch (err: any) {
      console.error("Failed to prepare note for external editor:", err);
      state.setStatusMessage(
        t(I18N_KEYS.STATUS_EXTERNAL_EDITOR_FAILED, { error: err.message }),
      );
      return false;
    }

    const editorCmd = process.env.VISUAL || process.env.EDITOR || "vim";
    const parts = editorCmd.trim().split(/\s+/);
    const exe = parts[0] || "vim";
    const args = [...parts.slice(1), filePath];

    try {
      if (renderer && typeof renderer.suspend === "function") {
        renderer.suspend();
      }
    } catch (suspendErr) {
      console.error("Failed to suspend renderer for external editor:", suspendErr);
    }

    let spawnError: Error | null = null;
    try {
      const result = spawnSync(exe, args, {
        stdio: "inherit",
      });
      if (result.error) {
        spawnError = result.error;
      }
    } catch (err: any) {
      spawnError = err;
    } finally {
      try {
        if (renderer && typeof renderer.resume === "function") {
          renderer.resume();
        }
      } catch (resumeErr) {
        console.error(
          "Failed to resume renderer after external editor:",
          resumeErr,
        );
      }
    }

    if (spawnError) {
      console.error("External editor process failed:", spawnError);
      state.setStatusMessage(
        t(I18N_KEYS.STATUS_EXTERNAL_EDITOR_FAILED, { error: spawnError.message }),
      );
      return false;
    }

    try {
      const res = await readNote(folderName, filename);
      if (res.success && typeof res.content === "string") {
        const updatedNotes = await listNotes(folderName);
        const foundNote = updatedNotes.find((n) => n.filename === filename);
        const title = foundNote?.title || filename.replace(/\.md$/, "");

        set({
          activeNote: {
            folderName,
            filename,
            title,
            content: res.content,
            updatedAt: foundNote?.updatedAt || Date.now(),
            isDirty: false,
          },
          isEditing: false,
          notes: folderName === get().activeFolder ? updatedNotes : get().notes,
        });

        if (folderName === "myday") {
          await get().listMyDayNotesAction();
        }
        await get().refreshTodos();
        await get().refreshLinks();

        const relativePath = getRelativePath(folderName, filename);
        backgroundCommit(`Update note: ${title}`, [filePath]);

        if (shouldIndexInBackground()) {
          getEmbeddingService()
            .indexNote(
              relativePath,
              title,
              folderName,
              res.content,
              foundNote?.updatedAt || Date.now(),
            )
            .catch((err) => {
              console.error("Failed to index note after external editor:", err);
            });
        }

        get().setStatusMessage(
          t(I18N_KEYS.STATUS_EXTERNAL_EDITOR_SUCCESS, { editor: editorCmd }),
        );
        return true;
      }
    } catch (reloadErr: any) {
      console.error("Failed to reload note after external editor:", reloadErr);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_EXTERNAL_EDITOR_FAILED, { error: reloadErr.message }),
      );
      return false;
    }

    return true;
  },
});
