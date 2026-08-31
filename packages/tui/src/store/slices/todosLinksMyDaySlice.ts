import type { StateCreator } from "zustand";
import type { AppStoreState, TodosLinksMyDaySlice } from "../types";
import { t, I18N_KEYS } from "../../i18n";
import {
  getMyDayNote,
  writeMyDayNote,
  listMyDayNotes,
  scanTodos,
  scanTodosForFile,
  scanLinksForFile,
  toggleTodo,
  cycleTodoStatus,
  setTodoStatus,
  setTodoPriority,
  getLinks,
  addManualLink,
  deleteManualLink,
  TodoItem,
  TodoStatus,
  LinkItem,
  getLocalDateString,
} from "@lyratui/core";

export const createTodosLinksMyDaySlice: StateCreator<
  AppStoreState,
  [],
  [],
  TodosLinksMyDaySlice
> = (set, get) => ({
  myDayNotes: [],
  activeMyDayDate: getLocalDateString(),
  todos: [],
  selectedTodoIndex: 0,
  links: [],
  selectedLinkIndex: 0,

  setSelectedTodoIndex: (index: number | ((prev: number) => number)) => {
    set((state) => ({
      selectedTodoIndex:
        typeof index === "function" ? index(state.selectedTodoIndex) : index,
    }));
  },

  setSelectedLinkIndex: (index: number | ((prev: number) => number)) => {
    set((state) => ({
      selectedLinkIndex:
        typeof index === "function" ? index(state.selectedLinkIndex) : index,
    }));
  },

  listMyDayNotesAction: async () => {
    try {
      const m = await listMyDayNotes();
      set({ myDayNotes: m });
    } catch (err: any) {
      console.error("Failed to list MyDay notes:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_LOADING_MYDAY, { error: err.message }),
      );
    }
  },

  openMyDayDate: async (dateStr: string) => {
    try {
      set({ activeMyDayDate: dateStr, viewMode: "myday" });
      const res = await getMyDayNote(dateStr);
      if (res.success) {
        set({
          activeNote: {
            folderName: "myday",
            filename: res.filename || `${dateStr}.md`,
            title: `Daily Log: ${dateStr}`,
            content: res.content || "",
            updatedAt: res.updatedAt,
            isDirty: false,
          },
        });
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_MYDAY_DATE, { date: dateStr }),
        );
      }
    } catch (err: any) {
      console.error("Failed to open MyDay date:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_OPEN_MYDAY, { error: err.message }),
      );
    }
  },

  saveMyDayContent: async (content: string) => {
    const activeDate = get().activeMyDayDate;
    try {
      const res = await writeMyDayNote(activeDate, content);
      if (res.success) {
        set((state) => ({
          activeNote: state.activeNote
            ? { ...state.activeNote, content, isDirty: false }
            : null,
        }));
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_MYDAY_SAVED, { date: activeDate }),
        );
        get().rescanFileDerived("myday", `${activeDate}.md`);
        const m = await listMyDayNotes();
        set({ myDayNotes: m });
      }
    } catch (err: any) {
      console.error("Failed to save MyDay content:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_SAVING_MYDAY, { error: err.message }),
      );
    }
  },

  refreshTodos: async () => {
    try {
      const tRes = await scanTodos();
      set({ todos: tRes, selectedTodoIndex: 0 });
    } catch (err: any) {
      console.error("Failed to refresh todos:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_SCANNING_TODOS, { error: err.message }),
      );
    }
  },

  rescanFileDerived: async (folderName: string, filename: string) => {
    try {
      const [newTodos, newLinks] = await Promise.all([
        scanTodosForFile(folderName, filename),
        scanLinksForFile(folderName, filename),
      ]);
      set((state) => {
        const sameFile = (
          item: { folderName?: string; filename?: string },
        ): boolean =>
          item.folderName === folderName && item.filename === filename;

        const merge = <T extends { folderName?: string; filename?: string }>(
          current: T[],
          fresh: T[],
        ): T[] => {
          if (
            current.every((item) => !sameFile(item)) &&
            fresh.length === 0
          ) {
            return current;
          }
          const firstIdx = current.findIndex((item) => sameFile(item));
          const kept = current.filter((item) => !sameFile(item));
          if (firstIdx === -1) {
            return fresh.length > 0 ? [...current, ...fresh] : current;
          }
          kept.splice(firstIdx, 0, ...fresh);
          return kept;
        };

        return {
          todos: merge(state.todos, newTodos),
          links: merge(state.links, newLinks),
        };
      });
    } catch (err: any) {
      console.error("Failed to rescan file derived data:", err);
    }
  },

  toggleTodoItem: async (index: number) => {
    const item = get().todos[index];
    if (!item) return;
    try {
      const newDone = !item.done;
      const res = await toggleTodo({
        folderName: item.folderName,
        filename: item.filename,
        index: item.index,
        done: newDone,
      });
      if (res.success) {
        set((state) => ({
          todos: state.todos.map((tItem, idx) =>
            idx === index
              ? { ...tItem, done: newDone, status: newDone ? "done" : "todo" }
              : tItem,
          ),
        }));
        get().setStatusMessage(
          newDone
            ? t(I18N_KEYS.STATUS_TODO_TOGGLED_DONE)
            : t(I18N_KEYS.STATUS_TODO_TOGGLED_UNDONE),
        );
      }
    } catch (err: any) {
      console.error("Failed to toggle todo item:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_TOGGLING_TODO, { error: err.message }),
      );
    }
  },

  cycleTodoItem: async (index: number) => {
    const item = get().todos[index];
    if (!item) return;
    try {
      const res = await cycleTodoStatus({
        folderName: item.folderName,
        filename: item.filename,
        index: item.index,
      });
      if (res.success && res.newStatus) {
        const isDone = res.newStatus === "done";
        set((state) => ({
          todos: state.todos.map((tItem, idx) =>
            idx === index
              ? { ...tItem, status: res.newStatus, done: isDone }
              : tItem,
          ),
        }));
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_TODO_STATUS, { status: res.newStatus }),
        );
      }
    } catch (err: any) {
      console.error("Failed to cycle todo item:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_CYCLING_TODO, { error: err.message }),
      );
    }
  },

  setTodoItemStatus: async (index: number, status: TodoStatus) => {
    const item = get().todos[index];
    if (!item) return;
    try {
      const res = await setTodoStatus({
        folderName: item.folderName,
        filename: item.filename,
        index: item.index,
        status,
      });
      if (res.success && res.newStatus) {
        const isDone = res.newStatus === "done";
        set((state) => ({
          todos: state.todos.map((tItem, idx) =>
            idx === index
              ? { ...tItem, status: res.newStatus, done: isDone }
              : tItem,
          ),
        }));
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_TODO_STATUS, { status: res.newStatus }),
        );
      }
    } catch (err: any) {
      console.error("Failed to set todo item status:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_SETTING_TODO_STATUS, { error: err.message }),
      );
    }
  },

  setTodoItemPriority: async (index: number, priority: string) => {
    const item = get().todos[index];
    if (!item) return;
    try {
      const res = await setTodoPriority({
        folderName: item.folderName,
        filename: item.filename,
        index: item.index,
        priority,
      });
      if (res.success && res.newPriority) {
        set((state) => ({
          todos: state.todos.map((tItem, idx) =>
            idx === index
              ? { ...tItem, priority: res.newPriority as string }
              : tItem,
          ),
        }));
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_TODO_PRIORITY, { priority: res.newPriority }),
        );
      }
    } catch (err: any) {
      console.error("Failed to set todo item priority:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_SETTING_TODO_PRIORITY, { error: err.message }),
      );
    }
  },

  openSourceLocation: async (
    folderName: string,
    filename: string,
    title?: string,
  ) => {
    if (folderName === "myday") {
      await get().openMyDayDate(filename.replace(/\.md$/, ""));
    } else {
      await get().selectFolder(folderName);
      await get().openNote(
        {
          filename,
          title: title || filename,
          snippet: "",
          updatedAt: 0,
          createdAt: 0,
        },
        folderName,
      );
    }
    set({ activePane: "editor" });
  },

  openTodoSource: async (item: TodoItem) => {
    await get().openSourceLocation(
      item.folderName,
      item.filename,
      item.noteTitle,
    );
  },

  openLinkSource: async (item: LinkItem) => {
    if (!item.folderName || !item.filename) {
      get().setStatusMessage(t(I18N_KEYS.STATUS_LINK_MANUAL_NO_SOURCE));
      return;
    }
    await get().openSourceLocation(
      item.folderName,
      item.filename,
      item.noteTitle,
    );
  },

  refreshLinks: async () => {
    try {
      const l = await getLinks();
      set({ links: l, selectedLinkIndex: 0 });
    } catch (err: any) {
      console.error("Failed to refresh links:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_LOADING_LINKS, { error: err.message }),
      );
    }
  },

  addLinkAction: async ({
    url,
    title,
    description,
    tags,
  }: {
    url: string;
    title: string;
    description?: string;
    tags?: string[];
  }) => {
    try {
      const res = await addManualLink({ url, title, description, tags });
      if (res.success) {
        get().setStatusMessage(t(I18N_KEYS.STATUS_LINK_ADDED_TITLE, { title }));
        await get().refreshLinks();
        return true;
      }
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_ADDING_LINK, {
          error: res.error || "unknown error",
        }),
      );
      return false;
    } catch (err: any) {
      console.error("Failed to add manual link:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_ADDING_LINK, { error: err.message }),
      );
      return false;
    }
  },

  deleteLinkAction: async (id: string) => {
    try {
      const res = await deleteManualLink(id);
      if (res.success) {
        get().setStatusMessage(t(I18N_KEYS.STATUS_LINK_DELETED));
        await get().refreshLinks();
        return true;
      }
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_DELETING_LINK, {
          error: res.error || "unknown error",
        }),
      );
      return false;
    } catch (err: any) {
      console.error("Failed to delete manual link:", err);
      get().setStatusMessage(
        t(I18N_KEYS.STATUS_ERROR_DELETING_LINK, { error: err.message }),
      );
      return false;
    }
  },
});
