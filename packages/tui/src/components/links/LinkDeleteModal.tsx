import React from "react";
import { LinkItem } from "@lyratui/core";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "../../i18n";
import { useTheme } from "../../theme";

interface LinkDeleteModalProps {
  isOpen: boolean;
  link: LinkItem | null;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function LinkDeleteModal({
  isOpen,
  link,
  onConfirm,
  onClose,
}: LinkDeleteModalProps): any {
  const theme = useTheme();
  const { t, keys } = useTranslation();

  useKeyboard((key) => {
    if (!isOpen || !link) return;

    if (key.name === "escape" || key.name === "n" || key.name === "N") {
      key.preventDefault?.();
      onClose();
      return;
    }

    if (key.name === "return" || key.name === "y" || key.name === "Y") {
      key.preventDefault?.();
      void onConfirm();
      return;
    }
  });

  if (!isOpen || !link) return null;

  return (
    <box
      position="absolute"
      top={6}
      left="20%"
      width="60%"
      borderStyle="rounded"
      borderColor={theme.accent.red}
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
        <text fg={theme.accent.red}>{t(keys.MODAL_LINK_DELETE_TITLE)}</text>
        <text fg={theme.text.dim}>{t(keys.MODAL_FOLDER_CANCEL_BADGE)}</text>
      </box>

      <text fg={theme.text.primary} marginBottom={1}>
        {t(keys.MODAL_LINK_DELETE_CONFIRM, {
          title: link.title || link.url,
        })}
      </text>

      <text fg={theme.accent.secondary} marginBottom={1}>
        {link.url}
      </text>

      <text fg={theme.accent.red} marginBottom={1}>
        {t(keys.MODAL_FOLDER_DELETE_WARN)}
      </text>

      <box flexDirection="row" justifyContent="flex-end" gap={2} marginTop={1}>
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
