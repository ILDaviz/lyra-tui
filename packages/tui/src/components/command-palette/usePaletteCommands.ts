import { useMemo } from "react";
import { useAppStore } from "../../store";
import { useRenderer } from "@opentui/react";
import { useTranslation } from "../../i18n";
import { listThemes } from "../../theme";
import {
  getGitService,
  saveConfig,
  getLocalDateString,
  getConfig,
  isKeychainAvailable,
} from "@lyratui/core";
import { CommandItem, SearchItem, PaletteTab, SearchMode } from "./types";

interface UsePaletteCommandsOptions {
  query: string;
  activeTab: PaletteTab;
  searchMode: SearchMode;
  noteResults: SearchItem[];
  setSelectedIndex: (idx: number) => void;
}

export function usePaletteCommands({
  query,
  activeTab,
  searchMode,
  noteResults,
  setSelectedIndex,
}: UsePaletteCommandsOptions) {
  const renderer = useRenderer();
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setTheme = useAppStore((s) => s.setTheme);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const selectFolder = useAppStore((s) => s.selectFolder);
  const folders = useAppStore((s) => s.folders);
  const notes = useAppStore((s) => s.notes);
  const createNewNote = useAppStore((s) => s.createNewNote);
  const openInExternalEditor = useAppStore((s) => s.openInExternalEditor);
  const openMyDayDate = useAppStore((s) => s.openMyDayDate);
  const refreshTodos = useAppStore((s) => s.refreshTodos);
  const refreshLinks = useAppStore((s) => s.refreshLinks);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const openFolderModal = useAppStore((s) => s.openFolderModal);
  const setActivePane = useAppStore((s) => s.setActivePane);
  const openNote = useAppStore((s) => s.openNote);
  const activeFolder = useAppStore((s) => s.activeFolder);
  const activeNote = useAppStore((s) => s.activeNote);
  const setNoteHistoryOpen = useAppStore((s) => s.setNoteHistoryOpen);
  const setAttachFileModalOpen = useAppStore((s) => s.setAttachFileModalOpen);
  const setAttachmentsListOpen = useAppStore((s) => s.setAttachmentsListOpen);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const { t, keys, setLocale } = useTranslation();

  const today = getLocalDateString();

  const commands: CommandItem[] = useMemo(
    () => [
      ...(activeNote
        ? [
            {
              id: "note-history",
              title: t(keys.CMD_NOTE_HISTORY),
              category: t(keys.CAT_ACTIONS),
              action: () => {
                setViewMode("notes");
                setActivePane("editor");
                setCommandPaletteOpen(false);
                setNoteHistoryOpen(true);
              },
            },
            {
              id: "attach-file",
              title: t(keys.CMD_ATTACH_FILE),
              category: t(keys.CAT_ACTIONS),
              action: () => {
                setActivePane("editor");
                setCommandPaletteOpen(false);
                setAttachFileModalOpen(true);
              },
            },
            {
              id: "open-attachments",
              title: t(keys.CMD_OPEN_ATTACHMENTS),
              category: t(keys.CAT_ACTIONS),
              action: () => {
                setActivePane("editor");
                setCommandPaletteOpen(false);
                setAttachmentsListOpen(true);
              },
            },
          ]
        : []),
      {
        id: "open-external-editor",
        title: t(keys.CMD_OPEN_EXTERNAL_EDITOR),
        category: t(keys.CAT_ACTIONS),
        action: () => {
          setCommandPaletteOpen(false);
          openInExternalEditor(renderer);
        },
      },
      {
        id: "new-note",
        title: t(keys.CMD_NEW_NOTE),
        category: t(keys.CAT_ACTIONS),
        action: () => {
          createNewNote();
          setCommandPaletteOpen(false);
        },
      },
      {
        id: "new-folder",
        title: t(keys.CMD_NEW_FOLDER),
        category: t(keys.CAT_ACTIONS),
        action: () => {
          setCommandPaletteOpen(false);
          openFolderModal("create");
        },
      },
      {
        id: "view-notes",
        title: t(keys.CMD_VIEW_NOTES),
        category: t(keys.CAT_NAVIGATION),
        action: () => {
          setViewMode("notes");
          setActivePane("list");
          setCommandPaletteOpen(false);
        },
      },
      {
        id: "view-myday",
        title: t(keys.CMD_VIEW_MYDAY),
        category: t(keys.CAT_NAVIGATION),
        action: () => {
          openMyDayDate(today);
          setActivePane("list");
          setCommandPaletteOpen(false);
        },
      },
      {
        id: "view-todos",
        title: t(keys.CMD_VIEW_TODOS),
        category: t(keys.CAT_NAVIGATION),
        action: () => {
          setViewMode("todos");
          setActivePane("list");
          refreshTodos();
          setCommandPaletteOpen(false);
        },
      },
      {
        id: "view-links",
        title: t(keys.CMD_VIEW_LINKS),
        category: t(keys.CAT_NAVIGATION),
        action: () => {
          setViewMode("links");
          setActivePane("list");
          refreshLinks();
          setCommandPaletteOpen(false);
        },
      },
      {
        id: "git-pull",
        title: t(keys.CMD_GIT_PULL),
        category: t(keys.CAT_SYSTEM),
        action: () => {
          setCommandPaletteOpen(false);
          void (async () => {
            try {
              setStatusMessage(t(keys.STATUS_GIT_PULLING));
              const out = await getGitService().pull();
              setStatusMessage(
                t(keys.STATUS_GIT_PULL_DONE, { status: out || "Up to date" }),
              );
            } catch (err: any) {
              console.error("Git pull failed in command palette:", err);
              setStatusMessage(
                t(keys.STATUS_GIT_PULL_FAILED, { error: err.message }),
              );
            }
          })();
        },
      },
      {
        id: "git-push",
        title: t(keys.CMD_GIT_PUSH),
        category: t(keys.CAT_SYSTEM),
        action: () => {
          setCommandPaletteOpen(false);
          void (async () => {
            try {
              setStatusMessage(t(keys.STATUS_GIT_PUSHING));
              const out = await getGitService().push();
              setStatusMessage(
                t(keys.STATUS_GIT_PUSH_DONE, { status: out || "Pushed" }),
              );
            } catch (err: any) {
              console.error("Git push failed in command palette:", err);
              setStatusMessage(
                t(keys.STATUS_GIT_PUSH_FAILED, { error: err.message }),
              );
            }
          })();
        },
      },
      {
        id: "refresh-all",
        title: t(keys.CMD_REFRESH_ALL),
        category: t(keys.CAT_SYSTEM),
        action: async () => {
          await refreshAll();
          setStatusMessage(t(keys.STATUS_REFRESHED_ALL));
          setCommandPaletteOpen(false);
        },
      },
      {
        id: "switch-lang-en",
        title: t(keys.CMD_SWITCH_LANG_EN),
        category: t(keys.CAT_LANGUAGE),
        action: async () => {
          setLocale("en");
          await saveConfig({ language: "en" });
          setStatusMessage(t(keys.STATUS_LANG_CHANGED, { lang: "English" }));
          setCommandPaletteOpen(false);
        },
      },
      {
        id: "switch-lang-it",
        title: t(keys.CMD_SWITCH_LANG_IT),
        category: t(keys.CAT_LANGUAGE),
        action: async () => {
          setLocale("it");
          await saveConfig({ language: "it" });
          setStatusMessage(t(keys.STATUS_LANG_CHANGED, { lang: "Italiano" }));
          setCommandPaletteOpen(false);
        },
      },
      ...listThemes().map((tItem) => ({
        id: `theme-${tItem.id}`,
        title: t(keys.STATUS_THEME_TITLE, { theme: tItem.displayName }),
        category: t(keys.STATUS_THEME_CATEGORY),
        action: async () => {
          setTheme(tItem.id);
          await saveConfig({ theme: tItem.id } as any);
          setStatusMessage(
            t(keys.STATUS_THEME_SET, { theme: tItem.displayName }),
          );
          setCommandPaletteOpen(false);
        },
      })),
      {
        id: "toggle-keychain",
        title: t(keys.CMD_TOGGLE_KEYCHAIN, {
          state: getConfig().useKeychain
            ? t(keys.STATE_ON)
            : t(keys.STATE_OFF),
        }),
        category: t(keys.CAT_SYSTEM),
        action: async () => {
          if (!isKeychainAvailable()) {
            setStatusMessage(t(keys.STATUS_KEYCHAIN_UNAVAILABLE));
            setCommandPaletteOpen(false);
            return;
          }
          const next = !getConfig().useKeychain;
          await saveConfig({ useKeychain: next });
          setStatusMessage(
            t(keys.STATUS_KEYCHAIN_SET, {
              state: next ? t(keys.STATE_ON) : t(keys.STATE_OFF),
            }),
          );
          setCommandPaletteOpen(false);
        },
      },
      ...folders.map((f) => ({
        id: `goto-folder-${f}`,
        title: t(keys.CMD_GOTO_FOLDER, {
          folder: f === "/" ? t(keys.HEADER_BREADCRUMB_ROOT) : f,
        }),
        category: t(keys.CAT_FOLDERS),
        action: async () => {
          await selectFolder(f);
          setActivePane("list");
          setCommandPaletteOpen(false);
        },
      })),
    ],
    [
      t,
      keys,
      folders,
      createNewNote,
      setCommandPaletteOpen,
      openFolderModal,
      setViewMode,
      setActivePane,
      openMyDayDate,
      today,
      refreshTodos,
      refreshLinks,
      setStatusMessage,
      refreshAll,
      setLocale,
      setTheme,
      selectFolder,
      activeNote,
      setNoteHistoryOpen,
      setAttachFileModalOpen,
      setAttachmentsListOpen,
      setSelectedIndex,
    ],
  );

  const filteredCommands = useMemo(
    () =>
      commands.filter(
        (c) =>
          c.title.toLowerCase().includes(query.toLowerCase()) ||
          c.category.toLowerCase().includes(query.toLowerCase()),
      ),
    [commands, query],
  );

  const localTextResults = useMemo(
    () =>
      activeTab === "search" &&
      searchMode === "text" &&
      query.trim().length >= 2
        ? notes
            .filter((note) => {
              const needle = query.trim().toLowerCase();
              return `${note.title} ${note.filename} ${note.snippet}`
                .toLowerCase()
                .includes(needle);
            })
            .map((note) => ({
              id: `local-note:${note.filename}`,
              title: note.title || note.filename,
              category: t(keys.CAT_NOTES_CURRENT),
              description: note.snippet,
              action: async () => {
                setViewMode("notes");
                await selectFolder(activeFolder);
                await openNote(note, activeFolder);
                setActivePane("editor");
                setCommandPaletteOpen(false);
              },
            }))
        : [],
    [
      activeTab,
      searchMode,
      query,
      notes,
      t,
      keys,
      setViewMode,
      selectFolder,
      activeFolder,
      openNote,
      setActivePane,
      setCommandPaletteOpen,
    ],
  );

  const filtered: SearchItem[] =
    activeTab === "commands" ? filteredCommands : noteResults;

  const visibleResults =
    activeTab === "search" && searchMode === "text" && noteResults.length === 0
      ? localTextResults
      : filtered;

  return {
    commands,
    filteredCommands,
    localTextResults,
    visibleResults,
  };
}
