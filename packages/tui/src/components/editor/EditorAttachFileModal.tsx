import React, { useState, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import { useBindings } from "@opentui/keymap/react";
import { copyFileAttachment, normalizeDroppedPath } from "@lyratui/core";
import { useTranslation } from "../../i18n";
import { useTheme } from "../../theme";
import { useAppStore } from "../../store";

export interface EditorAttachFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertAttachment: (linkText: string) => void;
  noteTitle?: string;
}

export function EditorAttachFileModal({
  isOpen,
  onClose,
  onInsertAttachment,
  noteTitle,
}: EditorAttachFileModalProps): any {
  const theme = useTheme();
  const { t, keys } = useTranslation();
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const [pathInput, setPathInput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setPathInput("");
    setError(null);
    setBusy(false);
  }, [isOpen]);

  const handleSubmit = async () => {
    if (busy) return;
    const normalized = normalizeDroppedPath(pathInput);
    if (!normalized) return;

    setBusy(true);
    setError(null);
    try {
      const result = await copyFileAttachment(normalized);
      if (result.success && result.url && result.filename) {
        onInsertAttachment(`[${result.filename}](${result.url})`);
        setStatusMessage(
          t(keys.EDITOR_ATTACH_SUCCESS, { filename: result.filename }),
        );
        onClose();
      } else {
        setError(result.error || t(keys.EDITOR_ATTACH_FAILED, { error: "-" }));
      }
    } catch (err: any) {
      setError(t(keys.EDITOR_ATTACH_FAILED, { error: err?.message || err }));
    } finally {
      setBusy(false);
    }
  };

  useBindings(
    () => ({
      priority: 100,
      enabled: isOpen,
      commands: [
        { name: "attach.submit", run: () => void handleSubmit() },
        { name: "attach.close", run: onClose },
      ],
      bindings: [
        { key: "return", cmd: "attach.submit", desc: "Attach file" },
        { key: "escape", cmd: "attach.close", desc: "Close attach dialog" },
      ],
    }),
    [isOpen, pathInput, busy, handleSubmit, onClose],
  );

  useKeyboard((key) => {
    if (!isOpen) return;

    if (key.name === "escape") {
      key.preventDefault?.();
      onClose();
      return;
    }
  });

  if (!isOpen) return null;

  return (
    <box
      position="absolute"
      top="30%"
      left="15%"
      width="70%"
      height={11}
      borderStyle="rounded"
      borderColor={theme.accent.secondary}
      flexDirection="column"
      padding={1}
      backgroundColor={theme.bg.panelAlt}
    >
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        marginBottom={1}
      >
        <box flexDirection="row" gap={1} alignItems="center">
          <text fg={theme.accent.primary}>{t(keys.EDITOR_ATTACH_TITLE)}</text>
          {noteTitle ? (
            <>
              <text fg={theme.text.dim}>•</text>
              <text fg={theme.accent.green}>{`[[${noteTitle}]]`}</text>
            </>
          ) : null}
        </box>
        <text fg={theme.text.dim}>{t(keys.EDITOR_ATTACH_CLOSE_HINT)}</text>
      </box>

      <box
        borderStyle="rounded"
        borderColor={theme.border.focus}
        paddingLeft={1}
        paddingRight={1}
        marginBottom={1}
        backgroundColor={theme.bg.input}
        flexShrink={0}
      >
        <input
          focused={true}
          value={pathInput}
          onInput={(val: string) => setPathInput(val)}
          placeholder={t(keys.EDITOR_ATTACH_PLACEHOLDER)}
        />
      </box>

      <box
        flexDirection="row"
        justifyContent="center"
        alignItems="center"
        flexShrink={0}
      >
        {error ? (
          <text fg={theme.accent.red}>{error}</text>
        ) : (
          <text fg={theme.text.dim}>{t(keys.EDITOR_ATTACH_HINT)}</text>
        )}
      </box>
    </box>
  );
}
