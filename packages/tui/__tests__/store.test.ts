import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { useAppStore } from "../src/store";
import { t, I18N_KEYS } from "../src/i18n";
import {
  getRepoPath,
  writeNote,
  createFolder,
  deleteFolder,
} from "@lyratui/core";

describe("Zustand AppStore & State Slices", () => {
  let repoPath = "";

  beforeEach(async () => {
    repoPath = getRepoPath();
    await fs.mkdir(repoPath, { recursive: true });

    useAppStore.setState({
      viewMode: "myday",
      activePane: "sidebar",
      isEditing: false,
      statusMessage: "Ready",
      repoPath: "",
      isCommandPaletteOpen: false,
      isHelpOpen: false,
      folderModal: { type: null },
      noteModal: { type: null },
      linkModalOpen: false,
      copyPopup: { visible: false, message: "" },
      folders: ["/"],
      activeFolder: "/",
      notes: [],
      selectedNoteIndex: 0,
      activeNote: null,
      notesRequestId: 0,
      myDayNotes: [],
      activeMyDayDate: "2026-08-21",
      todos: [],
      selectedTodoIndex: 0,
      links: [],
      selectedLinkIndex: 0,
    });
  });

  afterEach(async () => {
    await fs
      .rm(path.join(repoPath, "TestStoreFolder"), {
        recursive: true,
        force: true,
      })
      .catch(() => {});
    await fs
      .rm(path.join(repoPath, "RenamedStoreFolder"), {
        recursive: true,
        force: true,
      })
      .catch(() => {});
    await fs
      .rm(path.join(repoPath, "TargetStoreFolder"), {
        recursive: true,
        force: true,
      })
      .catch(() => {});
  });

  describe("Navigation Slice", () => {
    it("should update viewMode and activePane correctly", () => {
      const store = useAppStore.getState();
      expect(store.viewMode).toBe("myday");
      expect(store.activePane).toBe("sidebar");

      store.setViewMode("notes");
      expect(useAppStore.getState().viewMode).toBe("notes");

      store.setActivePane("editor");
      expect(useAppStore.getState().activePane).toBe("editor");

      store.setIsEditing(true);
      expect(useAppStore.getState().isEditing).toBe(true);
    });

    it("should cycle panes properly according to viewMode", () => {
      const store = useAppStore.getState();

      store.setViewMode("notes");
      store.setActivePane("sidebar");
      store.setIsEditing(false);

      store.cyclePane();
      expect(useAppStore.getState().activePane).toBe("list");

      store.cyclePane();
      expect(useAppStore.getState().activePane).toBe("editor");

      store.cyclePane();
      expect(useAppStore.getState().activePane).toBe("sidebar");

      store.setViewMode("todos");
      store.setActivePane("sidebar");

      store.cyclePane();
      expect(useAppStore.getState().activePane).toBe("list");

      store.cyclePane();
      expect(useAppStore.getState().activePane).toBe("sidebar");

      store.setViewMode("links");
      store.setActivePane("sidebar");

      store.cyclePane();
      expect(useAppStore.getState().activePane).toBe("list");

      store.setIsEditing(true);
      store.cyclePane();
      expect(useAppStore.getState().activePane).toBe("list");
    });
  });

  describe("UI Slice", () => {
    it("should manage modals and status messages", () => {
      const store = useAppStore.getState();

      store.setStatusMessage("Testing 123");
      expect(useAppStore.getState().statusMessage).toBe("Testing 123");

      store.setRepoPath("/tmp/lyra-test-repo");
      expect(useAppStore.getState().repoPath).toBe("/tmp/lyra-test-repo");

      store.openFolderModal("create");
      expect(useAppStore.getState().folderModal).toEqual({
        type: "create",
        targetFolder: undefined,
      });

      store.closeFolderModal();
      expect(useAppStore.getState().folderModal).toEqual({ type: null });

      store.openNoteModal("move", {
        folderName: "/",
        filename: "test.md",
        title: "Test Note",
      });
      expect(useAppStore.getState().noteModal).toEqual({
        type: "move",
        targetFolder: "/",
        targetFilename: "test.md",
        targetTitle: "Test Note",
      });

      store.closeNoteModal();
      expect(useAppStore.getState().noteModal).toEqual({ type: null });

      store.setCommandPaletteOpen(true);
      expect(useAppStore.getState().isCommandPaletteOpen).toBe(true);

      store.setHelpOpen(true);
      expect(useAppStore.getState().isHelpOpen).toBe(true);

      store.setLinkModalOpen(true);
      expect(useAppStore.getState().linkModalOpen).toBe(true);
    });

    it("should handle copy popup and clipboard copy", async () => {
      const store = useAppStore.getState();

      store.showCopyPopup("Copied custom text");
      expect(useAppStore.getState().copyPopup.visible).toBe(true);
      expect(useAppStore.getState().copyPopup.message).toBe(
        "Copied custom text",
      );

      const emptyRes = await store.copyToClipboard("");
      expect(emptyRes).toBe(false);

      const copyResult = await store.copyToClipboard("Clipboard text");
      expect(typeof copyResult).toBe("boolean");
    });
  });

  describe("Folders & Notes Slice", () => {
    it("should create, rename, and delete folders with state updates", async () => {
      const store = useAppStore.getState();

      const created = await store.createFolderAction("TestStoreFolder");
      expect(created).toBe(true);
      expect(useAppStore.getState().folders).toContain("TestStoreFolder");
      expect(useAppStore.getState().activeFolder).toBe("TestStoreFolder");

      const renamed = await store.renameFolderAction(
        "TestStoreFolder",
        "RenamedStoreFolder",
      );
      expect(renamed).toBe(true);
      expect(useAppStore.getState().folders).toContain("RenamedStoreFolder");
      expect(useAppStore.getState().folders).not.toContain("TestStoreFolder");
      expect(useAppStore.getState().activeFolder).toBe("RenamedStoreFolder");

      const deleted = await store.deleteFolderAction("RenamedStoreFolder");
      expect(deleted).toBe(true);
      expect(useAppStore.getState().folders).not.toContain(
        "RenamedStoreFolder",
      );
      expect(useAppStore.getState().activeFolder).toBe("/");
    });

    it("should handle invalid folder operations properly", async () => {
      const store = useAppStore.getState();

      const deleteRoot = await store.deleteFolderAction("/");
      expect(deleteRoot).toBe(false);

      const renameRoot = await store.renameFolderAction("/", "NewRoot");
      expect(renameRoot).toBe(false);
    });

    it("should create a note, mark dirty, save content, move note, and delete it", async () => {
      const store = useAppStore.getState();

      await store.createNewNote("My Unique Store Note");
      const active = useAppStore.getState().activeNote;
      expect(active).not.toBeNull();
      expect(active?.title).toContain("My Unique Store Note");
      expect(active?.isDirty).toBe(false);

      store.markNoteDirty();
      expect(useAppStore.getState().activeNote?.isDirty).toBe(true);

      await store.saveNoteContent("# Updated Content\n\nSome body text.");
      const updated = useAppStore.getState().activeNote;
      expect(updated?.content).toContain("# Updated Content");
      expect(updated?.isDirty).toBe(false);

      await createFolder("TargetStoreFolder");

      if (updated) {
        const sameMove = await store.moveNoteAction(
          updated.folderName,
          updated.filename,
          updated.folderName,
        );
        expect(sameMove).toBe(true);

        const moveRes = await store.moveNoteAction(
          updated.folderName,
          updated.filename,
          "TargetStoreFolder",
        );
        expect(moveRes).toBe(true);

        const deleted = await store.deleteNoteAction(
          "TargetStoreFolder",
          updated.filename,
        );
        expect(deleted).toBe(true);
      }
    });

    it("should handle deleteCurrentNote and openNote accurately", async () => {
      const store = useAppStore.getState();

      useAppStore.setState({ activeNote: null });
      await store.deleteCurrentNote();

      await store.createNewNote("Deletable Note");
      const note = useAppStore.getState().activeNote;
      expect(note).not.toBeNull();

      if (note) {
        await store.openNote({
          filename: note.filename,
          title: note.title,
          snippet: "",
          updatedAt: note.updatedAt || 0,
          createdAt: 0,
        });
        expect(useAppStore.getState().activeNote?.filename).toBe(note.filename);

        await store.deleteCurrentNote();
      }
    });

    it("should handle race conditions in loadNotesForFolder and discard stale responses", async () => {
      const store = useAppStore.getState();

      const slowPromise = store.loadNotesForFolder("SlowFolder");

      const fastPromise = store.loadNotesForFolder("FastFolder");

      await Promise.all([slowPromise, fastPromise]);

      expect(useAppStore.getState().notesRequestId).toBe(2);
    });

    it("should open active note in external editor, suspend/resume renderer, and reload content", async () => {
      const store = useAppStore.getState();

      await store.createNewNote("External Editor Note");
      const active = useAppStore.getState().activeNote;
      expect(active).not.toBeNull();

      let suspended = false;
      let resumed = false;
      const mockRenderer = {
        suspend: vi.fn(() => {
          suspended = true;
        }),
        resume: vi.fn(() => {
          resumed = true;
        }),
      };

      const originalEditor = process.env.EDITOR;
      process.env.EDITOR = "true"; // Unix "true" command exits immediately with code 0

      try {
        const success = await store.openInExternalEditor(mockRenderer);
        expect(success).toBe(true);
        expect(mockRenderer.suspend).toHaveBeenCalledTimes(1);
        expect(mockRenderer.resume).toHaveBeenCalledTimes(1);
        expect(suspended).toBe(true);
        expect(resumed).toBe(true);
        expect(useAppStore.getState().statusMessage).toContain("Note opened and updated");
      } finally {
        if (originalEditor !== undefined) {
          process.env.EDITOR = originalEditor;
        } else {
          delete process.env.EDITOR;
        }
        if (active) {
          await store.deleteNoteAction(active.folderName, active.filename);
        }
      }
    });

    it("should report status message when no note is available for external editor", async () => {
      const store = useAppStore.getState();
      useAppStore.setState({
        viewMode: "notes",
        activeNote: null,
        notes: [],
        activeFolder: "/",
      });

      const success = await store.openInExternalEditor();
      expect(success).toBe(false);
      expect(useAppStore.getState().statusMessage).toBe(
        t(I18N_KEYS.STATUS_EXTERNAL_EDITOR_NO_NOTE),
      );
    });
  });

  describe("Todos, Links & MyDay Slice", () => {
    it("should manage selected indices for todos and links", () => {
      const store = useAppStore.getState();

      store.setSelectedTodoIndex(2);
      expect(useAppStore.getState().selectedTodoIndex).toBe(2);

      store.setSelectedTodoIndex((prev) => prev + 1);
      expect(useAppStore.getState().selectedTodoIndex).toBe(3);

      store.setSelectedLinkIndex(1);
      expect(useAppStore.getState().selectedLinkIndex).toBe(1);

      store.setSelectedLinkIndex((prev) => prev + 2);
      expect(useAppStore.getState().selectedLinkIndex).toBe(3);
    });

    it("should open, save, and list MyDay daily log notes", async () => {
      const store = useAppStore.getState();
      const testDate = "2026-08-21";

      await store.openMyDayDate(testDate);
      expect(useAppStore.getState().activeMyDayDate).toBe(testDate);
      expect(useAppStore.getState().viewMode).toBe("myday");
      expect(useAppStore.getState().activeNote?.folderName).toBe("myday");

      await store.saveMyDayContent("# Daily Log\n- [ ] Task 1");
      expect(useAppStore.getState().activeNote?.content).toContain("Task 1");
      expect(useAppStore.getState().activeNote?.isDirty).toBe(false);

      await store.listMyDayNotesAction();
      expect(Array.isArray(useAppStore.getState().myDayNotes)).toBe(true);
    });

    it("should handle todos interaction (toggle, cycle, priority, source)", async () => {
      const store = useAppStore.getState();

      await writeNote({
        folderName: "/",
        filename: "TodoStoreTest.md",
        content:
          "# Test Note\n- [ ] Buy groceries #high\n- [>] Finish store migration",
      });

      await store.refreshTodos();
      const todos = useAppStore.getState().todos;
      const testTodoIdx = todos.findIndex(
        (t) => t.filename === "TodoStoreTest.md",
      );

      if (testTodoIdx !== -1) {
        await store.toggleTodoItem(testTodoIdx);
        expect(useAppStore.getState().todos[testTodoIdx]?.done).toBe(true);

        await store.cycleTodoItem(testTodoIdx);

        await store.setTodoItemStatus(testTodoIdx, "paused");
        expect(useAppStore.getState().todos[testTodoIdx]?.status).toBe(
          "paused",
        );

        await store.setTodoItemPriority(testTodoIdx, "medium");
        expect(useAppStore.getState().todos[testTodoIdx]?.priority).toBe(
          "Medium",
        );

        const currentItem = useAppStore.getState().todos[testTodoIdx];
        if (currentItem) {
          await store.openTodoSource(currentItem);
          expect(useAppStore.getState().activePane).toBe("editor");
          expect(useAppStore.getState().activeNote?.filename).toBe(
            "TodoStoreTest.md",
          );
        }
      }

      await store.deleteNoteAction("/", "TodoStoreTest.md");
    });

    it("should handle links interaction (add manual link, refresh, open source)", async () => {
      const store = useAppStore.getState();

      const added = await store.addLinkAction({
        url: "https://zustand-demo.pmnd.rs",
        title: "Zustand Documentation",
      });
      expect(added).toBe(true);

      await store.refreshLinks();
      const links = useAppStore.getState().links;
      const foundLink = links.find((l) => l.url.includes("zustand-demo"));
      expect(foundLink).toBeDefined();

      if (foundLink) {
        await store.openLinkSource(foundLink);
        expect(useAppStore.getState().statusMessage).toBe(
          t(I18N_KEYS.STATUS_LINK_MANUAL_NO_SOURCE),
        );
      }
    });

    it("should navigate via openSourceLocation for standard and myday notes", async () => {
      const store = useAppStore.getState();

      await store.openSourceLocation("myday", "2026-08-21.md");
      expect(useAppStore.getState().viewMode).toBe("myday");
      expect(useAppStore.getState().activePane).toBe("editor");

      await store.createNewNote("Source Nav Note");
      const active = useAppStore.getState().activeNote;
      if (active) {
        await store.openSourceLocation("/", active.filename, active.title);
        expect(useAppStore.getState().activePane).toBe("editor");
        await store.deleteNoteAction("/", active.filename);
      }
    });
  });

  describe("Root Store Actions", () => {
    it("should run refreshAll and initializeApp cleanly", async () => {
      const store = useAppStore.getState();

      await store.refreshAll();
      expect(useAppStore.getState().statusMessage).toBe("Lyra synchronized");
      expect(useAppStore.getState().repoPath).toBeTruthy();

      await store.initializeApp();
      expect(useAppStore.getState().viewMode).toBe("myday");
      expect(useAppStore.getState().activeNote).not.toBeNull();
    });
  });
});
