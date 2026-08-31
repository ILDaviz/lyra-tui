import React, { useEffect } from "react";
import { useAppStore } from "./store";
import { useRenderer } from "@opentui/react";
import { useBindings } from "@opentui/keymap/react";
import { CliRenderEvents } from "@opentui/core";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { NotesList } from "./components/NotesList";
import { Editor } from "./components/editor";
import { MyDayView } from "./components/MyDayView";
import { TodosView } from "./components/todos";
import { LinksView } from "./components/links";
import { BootScreen } from "./components/BootScreen";
import { CommandPalette } from "./components/command-palette";
import { FolderModal } from "./components/FolderModal";
import { NoteModal } from "./components/NoteModal";
import { LinkModal } from "./components/LinkModal";
import { HelpModal } from "./components/HelpModal";
import { CopyPopup } from "./components/CopyPopup";
import { useTheme } from "./theme";
import { Footer } from "./components/Footer";
import { useTranslation } from "./i18n";
import { hasConfiguredProvider } from "@lyratui/core";

export function AppContent(): any {
  const theme = useTheme();
  const { t, keys } = useTranslation();
  const viewMode = useAppStore((s) => s.viewMode);
  const activeFolder = useAppStore((s) => s.activeFolder);
  const activeNoteTitle = useAppStore(
    (s) => s.activeNote?.title || s.activeNote?.filename,
  );
  const activeMyDayDate = useAppStore((s) => s.activeMyDayDate);
  const pendingTodosCount = useAppStore(
    (s) => s.todos.filter((t) => !t.done).length,
  );
  const linksCount = useAppStore((s) => s.links.length);
  const activePane = useAppStore((s) => s.activePane);
  const setActivePane = useAppStore((s) => s.setActivePane);
  const isCommandPaletteOpen = useAppStore((s) => s.isCommandPaletteOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const isHelpOpen = useAppStore((s) => s.isHelpOpen);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
  const isEditing = useAppStore((s) => s.isEditing);
  const aiConfigured = hasConfiguredProvider();
  const isModalOpen = useAppStore((s) =>
    Boolean(
      s.folderModal.type ||
      s.noteModal.type ||
      s.linkModalOpen ||
      s.isNoteHistoryOpen ||
      s.isLocalGraphOpen ||
      s.isWikilinkPickerOpen ||
      (s.isAiModalOpen && aiConfigured),
    ),
  );
  const copyToClipboard = useAppStore((s) => s.copyToClipboard);
  const isBooting = useAppStore((s) => s.isBooting);

  const renderer = useRenderer();

  useEffect(() => {
    let title = "Lyra";
    if (viewMode === "notes") {
      const folderName =
        !activeFolder || activeFolder === "/" || activeFolder === "root"
          ? "root"
          : activeFolder;
      if (activeNoteTitle) {
        title = `Lyra — ${activeNoteTitle} (${folderName})`;
      } else {
        title = `Lyra — ${t(keys.HEADER_BREADCRUMB_NOTES)} (${folderName})`;
      }
    } else if (viewMode === "myday") {
      title = `Lyra — ${t(keys.HEADER_BREADCRUMB_MYDAY)} (${activeMyDayDate || t(keys.MYDAY_TODAY_LABEL)})`;
    } else if (viewMode === "todos") {
      title = `Lyra — ${t(keys.SIDEBAR_VIEW_TODOS)} (${pendingTodosCount})`;
    } else if (viewMode === "links") {
      title = `Lyra — ${t(keys.SIDEBAR_VIEW_LINKS)} (${linksCount})`;
    }

    renderer?.setTerminalTitle(title);

    return () => {
      renderer?.setTerminalTitle("");
    };
  }, [
    renderer,
    viewMode,
    activeNoteTitle,
    activeFolder,
    activeMyDayDate,
    pendingTodosCount,
    linksCount,
    t,
    keys,
  ]);

  useEffect(() => {
    if (!renderer) return;

    const handleSelection = async (selection: any) => {
      try {
        const text =
          selection?.getSelectedText?.() ||
          renderer.getSelection()?.getSelectedText?.();
        if (text && typeof text === "string" && text.trim().length > 0) {
          await copyToClipboard(text);
        }
      } catch (err) {
        console.error("Failed to copy selection to clipboard:", err);
      }
    };

    renderer.on(CliRenderEvents.SELECTION, handleSelection);
    return () => {
      renderer.off(CliRenderEvents.SELECTION, handleSelection);
    };
  }, [renderer, copyToClipboard]);

  const cycleFocus = () => {
    if (viewMode === "todos" || viewMode === "links") {
      setActivePane(activePane === "sidebar" ? "list" : "sidebar");
      return;
    }
    if (activePane === "sidebar") setActivePane("list");
    else if (activePane === "list") setActivePane("editor");
    else setActivePane("sidebar");
  };

  useBindings(
    () => ({
      priority: 1000,
      commands: [{ name: "app.quit", run: () => renderer.destroy() }],
      bindings: [
        { key: "ctrl+q", cmd: "app.quit", desc: "Quit Lyra" },
        { key: "super+q", cmd: "app.quit", desc: "Quit Lyra" },
      ],
    }),
    [renderer],
  );

  useBindings(
    () => ({
      priority: 1,
      enabled: !isModalOpen && !isHelpOpen && !isCommandPaletteOpen,
      commands: [
        { name: "app.help.toggle", run: () => setHelpOpen(!isHelpOpen) },
      ],
      bindings: [
        {
          key: "ctrl+h, super+h, f1",
          cmd: "app.help.toggle",
          desc: "Open help",
        },
      ],
    }),
    [isModalOpen, isHelpOpen, isCommandPaletteOpen, setHelpOpen],
  );

  useBindings(
    () => ({
      priority: 1,
      enabled: !isModalOpen && !isHelpOpen && !isEditing,
      commands: [
        {
          name: "app.palette.toggle",
          run: () => setCommandPaletteOpen(!isCommandPaletteOpen),
        },
        { name: "app.focus.next", run: cycleFocus },
      ],
      bindings: [
        {
          key: "ctrl+p, super+p",
          cmd: "app.palette.toggle",
          desc: "Open command palette",
        },
        { key: "tab", cmd: "app.focus.next", desc: "Move focus" },
      ],
    }),
    [
      isModalOpen,
      isHelpOpen,
      isEditing,
      isCommandPaletteOpen,
      activePane,
      viewMode,
      setActivePane,
      setHelpOpen,
      setCommandPaletteOpen,
    ],
  );

  if (isBooting) {
    return <BootScreen />;
  }

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={theme.bg.app}
    >
      <Header />

      <box
        flexDirection="row"
        flexGrow={1}
        alignItems="stretch"
        backgroundColor={theme.bg.app}
      >
        <Sidebar />

        {viewMode === "notes" && (
          <>
            <NotesList />
            <Editor />
          </>
        )}

        {viewMode === "myday" && <MyDayView />}
        {viewMode === "todos" && <TodosView />}
        {viewMode === "links" && <LinksView />}
      </box>

      <Footer />
      <CommandPalette />
      <FolderModal />
      <NoteModal />
      <LinkModal />
      <HelpModal />
      <CopyPopup />
    </box>
  );
}
