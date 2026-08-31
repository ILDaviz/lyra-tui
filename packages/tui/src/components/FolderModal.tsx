import React, { useState, useEffect } from "react";
import { useAppStore } from "../store";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "../i18n";
import { useTheme } from "../theme";

export function FolderModal(): any {
  const theme = useTheme();
  const folderModal = useAppStore((s) => s.folderModal);
  const closeFolderModal = useAppStore((s) => s.closeFolderModal);
  const createFolderAction = useAppStore((s) => s.createFolderAction);
  const renameFolderAction = useAppStore((s) => s.renameFolderAction);
  const deleteFolderAction = useAppStore((s) => s.deleteFolderAction);
  const isCommandPaletteOpen = useAppStore((s) => s.isCommandPaletteOpen);
  const { t, keys } = useTranslation();

  const [inputVal, setInputVal] = useState<string>("");

  useEffect(() => {
    if (folderModal.type === "rename" && folderModal.targetFolder) {
      setInputVal(folderModal.targetFolder);
    } else {
      setInputVal("");
    }
  }, [folderModal.type, folderModal.targetFolder]);

  useKeyboard(async (key) => {
    if (isCommandPaletteOpen || !folderModal.type) return;

    if (key.name === "escape") {
      closeFolderModal();
      return;
    }

    if (folderModal.type === "create") {
      if (key.name === "return") {
        const trimmed = inputVal.trim();
        if (trimmed) {
          closeFolderModal();
          await createFolderAction(trimmed);
        }
      }
    } else if (folderModal.type === "rename") {
      if (key.name === "return") {
        const trimmed = inputVal.trim();
        if (trimmed && folderModal.targetFolder) {
          closeFolderModal();
          await renameFolderAction(folderModal.targetFolder, trimmed);
        }
      }
    } else if (folderModal.type === "delete") {
      if (
        key.name === "return" ||
        key.name === "y" ||
        (key.name as any) === "Y"
      ) {
        if (folderModal.targetFolder) {
          closeFolderModal();
          await deleteFolderAction(folderModal.targetFolder);
        }
      } else if (key.name === "n" || (key.name as any) === "N") {
        closeFolderModal();
      }
    }
  });

  if (!folderModal.type) return null;

  if (folderModal.type === "create") {
    return (
      <box
        position="absolute"
        top={6}
        left="20%"
        width="60%"
        borderStyle="rounded"
        borderColor={theme.border.focus}
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
          <text fg={theme.accent.primary}>
            {t(keys.MODAL_FOLDER_CREATE_TITLE)}
          </text>
          <text fg={theme.text.dim}>{t(keys.MODAL_FOLDER_CANCEL_BADGE)}</text>
        </box>

        <text fg={theme.text.muted} marginBottom={1}>
          {t(keys.MODAL_FOLDER_CREATE_PROMPT)}
        </text>

        <box
          borderStyle="rounded"
          borderColor={theme.border.subtle}
          paddingLeft={1}
          marginBottom={1}
          backgroundColor={theme.bg.input}
        >
          <input
            focused={true}
            value={inputVal}
            onChange={(val: string) => setInputVal(val)}
            placeholder={t(keys.MODAL_FOLDER_CREATE_PLACEHOLDER)}
          />
        </box>

        <box flexDirection="row" justifyContent="flex-end" gap={2}>
          <text fg={theme.text.dim}>{t(keys.MODAL_FOLDER_CANCEL_BADGE)}</text>
          <text fg={theme.border.success}>
            {t(keys.MODAL_FOLDER_CREATE_BTN)}
          </text>
        </box>
      </box>
    );
  }

  if (folderModal.type === "rename") {
    return (
      <box
        position="absolute"
        top={6}
        left="20%"
        width="60%"
        borderStyle="rounded"
        borderColor={theme.accent.secondary}
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
          <text fg={theme.accent.secondary}>
            {t(keys.MODAL_FOLDER_RENAME_TITLE)}
          </text>
          <text fg={theme.text.dim}>{t(keys.MODAL_FOLDER_CANCEL_BADGE)}</text>
        </box>

        <text fg={theme.text.muted} marginBottom={1}>
          {t(keys.MODAL_FOLDER_RENAME_PROMPT, {
            folder: folderModal.targetFolder,
          })}
        </text>

        <box
          borderStyle="rounded"
          borderColor={theme.border.subtle}
          paddingLeft={1}
          marginBottom={1}
          backgroundColor={theme.bg.input}
        >
          <input
            focused={true}
            value={inputVal}
            onChange={(val: string) => setInputVal(val)}
            placeholder={t(keys.MODAL_FOLDER_RENAME_PLACEHOLDER)}
          />
        </box>

        <box flexDirection="row" justifyContent="flex-end" gap={2}>
          <text fg={theme.text.dim}>{t(keys.MODAL_FOLDER_CANCEL_BADGE)}</text>
          <text fg={theme.border.success}>{t(keys.MODAL_FOLDER_SAVE_BTN)}</text>
        </box>
      </box>
    );
  }

  if (folderModal.type === "delete") {
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
          <text fg={theme.accent.red}>{t(keys.MODAL_FOLDER_DELETE_TITLE)}</text>
          <text fg={theme.text.dim}>{t(keys.MODAL_FOLDER_CANCEL_BADGE)}</text>
        </box>

        <text fg={theme.text.primary} marginBottom={1}>
          {t(keys.MODAL_FOLDER_DELETE_CONFIRM, {
            folder: folderModal.targetFolder,
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

  return null;
}
