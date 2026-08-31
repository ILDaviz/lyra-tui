import React, { useState, useEffect } from "react";
import { useAppStore } from "../store";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "../i18n";
import { useTheme, getScrollbarOptions } from "../theme";

export function NoteModal(): any {
  const theme = useTheme();
  const noteModal = useAppStore((s) => s.noteModal);
  const closeNoteModal = useAppStore((s) => s.closeNoteModal);
  const folders = useAppStore((s) => s.folders);
  const deleteNoteAction = useAppStore((s) => s.deleteNoteAction);
  const moveNoteAction = useAppStore((s) => s.moveNoteAction);
  const isCommandPaletteOpen = useAppStore((s) => s.isCommandPaletteOpen);
  const { t, keys } = useTranslation();

  const [selectedFolderIdx, setSelectedFolderIdx] = useState<number>(0);

  useEffect(() => {
    setSelectedFolderIdx((prev) =>
      Math.max(0, Math.min(prev, folders.length - 1)),
    );
  }, [folders.length]);

  useKeyboard(async (key) => {
    if (isCommandPaletteOpen || !noteModal.type) return;

    if (key.name === "escape") {
      closeNoteModal();
      return;
    }

    if (noteModal.type === "delete") {
      if (
        key.name === "return" ||
        key.name === "y" ||
        (key.name as any) === "Y"
      ) {
        if (noteModal.targetFolder && noteModal.targetFilename) {
          closeNoteModal();
          await deleteNoteAction(
            noteModal.targetFolder,
            noteModal.targetFilename,
          );
        }
      } else if (key.name === "n" || (key.name as any) === "N") {
        closeNoteModal();
      }
    } else if (noteModal.type === "move") {
      if (key.name === "up" || key.name === "k") {
        setSelectedFolderIdx((prev) =>
          prev > 0 ? prev - 1 : folders.length - 1,
        );
      } else if (key.name === "down" || key.name === "j") {
        setSelectedFolderIdx((prev) =>
          prev < folders.length - 1 ? prev + 1 : 0,
        );
      } else if (key.name === "return") {
        const destFolder = folders[selectedFolderIdx];
        if (
          noteModal.targetFolder &&
          noteModal.targetFilename &&
          destFolder !== undefined
        ) {
          closeNoteModal();
          await moveNoteAction(
            noteModal.targetFolder,
            noteModal.targetFilename,
            destFolder,
          );
        }
      }
    }
  });

  if (!noteModal.type) return null;

  if (noteModal.type === "delete") {
    return (
      <box
        position="absolute"
        top={6}
        left="20%"
        width="60%"
        borderStyle="rounded"
        borderColor={theme.border.error}
        flexDirection="column"
        padding={1}
        backgroundColor={theme.bg.panel}
      >
        <box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          marginBottom={1}
        >
          <text fg={theme.accent.red}>{t(keys.MODAL_NOTE_DELETE_TITLE)}</text>
          <text fg={theme.text.dim}>{t(keys.MODAL_FOLDER_CANCEL_BADGE)}</text>
        </box>

        <text fg={theme.text.primary} marginBottom={1}>
          {t(keys.MODAL_NOTE_DELETE_CONFIRM, {
            title: noteModal.targetTitle || noteModal.targetFilename,
          })}
        </text>

        <text fg={theme.accent.red} marginBottom={1}>
          {t(keys.MODAL_FOLDER_DELETE_WARN)}
        </text>

        <box
          flexDirection="row"
          justifyContent="flex-end"
          gap={2}
          marginTop={1}
        >
          <text fg={theme.text.dim}>
            {t(keys.MODAL_FOLDER_DELETE_CANCEL_BTN)}
          </text>
          <text fg={theme.accent.red}>
            {t(keys.MODAL_FOLDER_DELETE_CONFIRM_BTN)}
          </text>
        </box>
      </box>
    );
  }

  if (noteModal.type === "move") {
    return (
      <box
        position="absolute"
        top={5}
        left="18%"
        width="64%"
        borderStyle="rounded"
        borderColor={theme.accent.purple}
        flexDirection="column"
        padding={1}
        backgroundColor={theme.bg.panel}
      >
        <box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          marginBottom={1}
        >
          <box flexDirection="row" gap={1} alignItems="center">
            <text fg={theme.accent.purple}>
              {t(keys.MODAL_NOTE_MOVE_TITLE)}
            </text>
            <text
              fg={theme.text.muted}
            >{`("${noteModal.targetTitle || noteModal.targetFilename}")`}</text>
          </box>
          <text fg={theme.text.dim}>{t(keys.MODAL_FOLDER_CANCEL_BADGE)}</text>
        </box>

        <text fg={theme.text.muted} marginBottom={1}>
          {t(keys.MODAL_NOTE_MOVE_PROMPT)}
        </text>

        <scrollbox
          maxHeight={8}
          marginBottom={1}
          verticalScrollbarOptions={getScrollbarOptions(theme, true)}
        >
          {folders.map((f, idx) => {
            const isSelected = selectedFolderIdx === idx;
            const isCurrent = noteModal.targetFolder === f;
            const rawName = f === "/" ? t(keys.HEADER_BREADCRUMB_ROOT) : f;
            const prefix = isSelected ? "▸ " : "  ";

            return (
              <box
                key={f}
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                width="100%"
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={isSelected ? theme.bg.selected : undefined}
              >
                <text
                  fg={
                    isSelected
                      ? theme.accent.purple
                      : isCurrent
                        ? theme.text.dim
                        : theme.text.secondary
                  }
                >
                  {`${prefix}${rawName}`}
                </text>
                {isCurrent ? (
                  <text fg={theme.text.dim}>
                    {t(keys.MODAL_NOTE_MOVE_CURRENT_BADGE)}
                  </text>
                ) : null}
              </box>
            );
          })}
        </scrollbox>

        <box flexDirection="row" justifyContent="flex-end" gap={2}>
          <text fg={theme.text.dim}>{t(keys.MODAL_FOLDER_CANCEL_BADGE)}</text>
          <text fg={theme.accent.purple}>{t(keys.MODAL_NOTE_MOVE_BTN)}</text>
        </box>
      </box>
    );
  }

  return null;
}
