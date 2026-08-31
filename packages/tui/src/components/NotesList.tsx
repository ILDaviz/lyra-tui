import React, { useState, useRef, useEffect } from "react";
import { useAppStore } from "../store";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { NoteMetadata } from "@lyratui/core";
import { useTranslation } from "../i18n";
import { useTheme } from "../theme";
import { MarqueeText } from "./MarqueeText";
import { VirtualList } from "./common/VirtualList";
import { ListFilterBar } from "./common/ListFilterBar";
import { useFuseFilter } from "../utils/fuzzy";

const NOTE_FUSE_KEYS = ["title", "filename", "snippet"];

function cleanSnippetText(snippet: string | undefined): string {
  return (snippet || "")
    .replace(/[`#*\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function noteItemHeight(note: NoteMetadata): number {
  return (cleanSnippetText(note.snippet) ? 2 : 1) + 1;
}

export function NotesList(): any {
  const theme = useTheme();
  const renderer = useRenderer();
  const notes = useAppStore((s) => s.notes);
  const selectedNoteIndex = useAppStore((s) => s.selectedNoteIndex);
  const setSelectedNoteIndex = useAppStore((s) => s.setSelectedNoteIndex);
  const openNote = useAppStore((s) => s.openNote);
  const openInExternalEditor = useAppStore((s) => s.openInExternalEditor);
  const activePane = useAppStore((s) => s.activePane);
  const setActivePane = useAppStore((s) => s.setActivePane);
  const createNewNote = useAppStore((s) => s.createNewNote);
  const openNoteModal = useAppStore((s) => s.openNoteModal);
  const isModalOpen = useAppStore((s) =>
    Boolean(s.noteModal.type || s.folderModal.type),
  );
  const activeFolder = useAppStore((s) => s.activeFolder);
  const activeNoteFilename = useAppStore((s) => s.activeNote?.filename);
  const isCommandPaletteOpen = useAppStore((s) => s.isCommandPaletteOpen);
  const isHelpOpen = useAppStore((s) => s.isHelpOpen);
  const { t, keys } = useTranslation();

  const isFocused = activePane === "list";

  const [filterQuery, setFilterQuery] = useState<string>("");
  const [isFilterEditing, setIsFilterEditing] = useState<boolean>(false);
  const filteredNotes = useFuseFilter(notes, NOTE_FUSE_KEYS, filterQuery);

  useEffect(() => {
    setSelectedNoteIndex(0);
  }, [filterQuery, setSelectedNoteIndex]);

  const lastActiveNoteFilenameRef = useRef(activeNoteFilename);
  useEffect(() => {
    if (activeNoteFilename !== lastActiveNoteFilenameRef.current) {
      lastActiveNoteFilenameRef.current = activeNoteFilename;
      if (!activeNoteFilename) return;
      const idx = filteredNotes.findIndex(
        (n) => n.filename === activeNoteFilename,
      );
      if (idx !== -1) {
        setSelectedNoteIndex(idx);
      }
    }
  }, [activeNoteFilename, filteredNotes, setSelectedNoteIndex]);

  useKeyboard((key) => {
    if (isCommandPaletteOpen || isHelpOpen || !isFocused || isModalOpen) return;

    if (isFilterEditing) {
      if (key.name === "escape") {
        setFilterQuery("");
        setIsFilterEditing(false);
        setSelectedNoteIndex(0);
      } else if (key.name === "return") {
        setIsFilterEditing(false);
      }
      return;
    }

    if (key.name === "/") {
      setIsFilterEditing(true);
      return;
    }

    if (key.name === "up" || key.name === "k") {
      setSelectedNoteIndex((prev) =>
        prev > 0 ? prev - 1 : Math.max(0, filteredNotes.length - 1),
      );
    } else if (key.name === "down" || key.name === "j") {
      setSelectedNoteIndex((prev) =>
        prev < filteredNotes.length - 1 ? prev + 1 : 0,
      );
    } else if (key.name === "pagedown") {
      setSelectedNoteIndex((prev) =>
        Math.min(filteredNotes.length - 1, prev + 5),
      );
    } else if (key.name === "pageup") {
      setSelectedNoteIndex((prev) => Math.max(0, prev - 5));
    } else if (key.name === "home" || (key.name === "g" && !key.shift)) {
      setSelectedNoteIndex(0);
    } else if (key.name === "end" || (key.name === "g" && key.shift)) {
      setSelectedNoteIndex(Math.max(0, filteredNotes.length - 1));
    } else if (key.name === "return" || key.name === "space") {
      const note = filteredNotes[selectedNoteIndex];
      if (note) {
        openNote(note);
        if (key.name === "return") setActivePane("editor");
      }
    } else if (key.name === "n" && key.ctrl) {
      createNewNote();
    } else if (key.name === "m") {
      const note = filteredNotes[selectedNoteIndex];
      if (note) {
        openNoteModal("move", {
          folderName: activeFolder,
          filename: note.filename,
          title: note.title || note.filename,
        });
      }
    } else if (
      key.name === "d" ||
      key.name === "delete" ||
      (key.name === "d" && key.ctrl)
    ) {
      const note = filteredNotes[selectedNoteIndex];
      if (note) {
        openNoteModal("delete", {
          folderName: activeFolder,
          filename: note.filename,
          title: note.title || note.filename,
        });
      }
    } else if (
      key.name === "v" ||
      (key.name === "e" && key.ctrl) ||
      (key.name === "e" && key.meta)
    ) {
      const note = filteredNotes[selectedNoteIndex];
      if (note) {
        openInExternalEditor(renderer, {
          folderName: activeFolder,
          filename: note.filename,
        });
      }
    }
  });

  return (
    <box
      borderStyle="rounded"
      borderColor={isFocused ? theme.border.focus : theme.border.subtle}
      width={32}
      height="100%"
      flexShrink={0}
      flexDirection="column"
      padding={1}
      backgroundColor={theme.bg.panel}
    >
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <text fg={isFocused ? theme.accent.primary : theme.text.muted}>
          {filterQuery
            ? `${t(keys.NOTES_LIST_TITLE)} (${filteredNotes.length}/${notes.length})`
            : `${t(keys.NOTES_LIST_TITLE)} (${notes.length})`}
        </text>
      </box>

      <box height={1} />

      <ListFilterBar
        query={filterQuery}
        onQueryChange={setFilterQuery}
        isActive={isFilterEditing}
        totalCount={notes.length}
        filteredCount={filteredNotes.length}
        theme={theme}
      />

      {filteredNotes.length === 0 ? (
        <box
          width="100%"
          justifyContent="center"
          alignItems="center"
          flexGrow={1}
          flexDirection="column"
          gap={1}
        >
          <text fg={theme.text.dim}>{t(keys.NOTES_LIST_EMPTY)}</text>
        </box>
      ) : (
        <VirtualList
          items={filteredNotes}
          getItemHeight={noteItemHeight}
          selectedIndex={selectedNoteIndex}
          theme={theme}
          isFocused={isFocused}
          getKey={(note) => note.filename}
          renderItem={(note, idx, isSelected) => {
            const rawTitle = note.title || note.filename;
            const prefix = isSelected ? "▸ " : "  ";
            const cleanSnippet = cleanSnippetText(note.snippet);

            return (
              <box
                flexDirection="column"
                width="100%"
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={isSelected ? theme.bg.selected : undefined}
                marginBottom={1}
              >
                <box flexDirection="row" width="100%">
                  <text fg={isSelected ? theme.accent.primary : theme.text.dim}>
                    {prefix}
                  </text>
                  <MarqueeText
                    text={rawTitle}
                    maxLength={22}
                    isSelected={isSelected}
                    isFocused={isFocused}
                    fg={
                      isSelected ? theme.accent.primary : theme.text.secondary
                    }
                  />
                </box>

                {cleanSnippet ? (
                  <box flexDirection="row" width="100%">
                    <text fg={isSelected ? theme.text.muted : theme.text.dim}>
                      {"   "}
                    </text>
                    <MarqueeText
                      text={cleanSnippet}
                      maxLength={21}
                      isSelected={isSelected}
                      isFocused={isFocused}
                      fg={isSelected ? theme.text.muted : theme.text.dim}
                    />
                  </box>
                ) : null}
              </box>
            );
          }}
        />
      )}
    </box>
  );
}
