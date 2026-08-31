import React, { useState, useEffect, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import { useBindings } from "@opentui/keymap/react";
import {
  resolveAttachmentPath,
  getAttachmentsDir,
} from "@lyratui/core";
import { useTranslation } from "../../i18n";
import { useTheme, getScrollbarOptions } from "../../theme";
import { scrollIndexIntoView } from "../../utils/scrollHelper";
import { MarqueeText } from "../MarqueeText";
import { openPathWithSystemApp } from "../../utils/systemOpen";
import { useAppStore } from "../../store";

export interface EditorAttachmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  attachments: string[];
  noteTitle?: string;
}

function displayName(attachmentUrl: string): string {
  try {
    return decodeURIComponent(
      attachmentUrl.replace(/^\.?\//, "").replace(/^attachments\//, ""),
    );
  } catch {
    return attachmentUrl;
  }
}

export function EditorAttachmentsModal({
  isOpen,
  onClose,
  attachments,
  noteTitle,
}: EditorAttachmentsModalProps): any {
  const theme = useTheme();
  const { t, keys } = useTranslation();
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const scrollboxRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIndex(0);
  }, [isOpen]);

  useEffect(() => {
    if (scrollboxRef.current && attachments.length > 0 && selectedIndex >= 0) {
      scrollIndexIntoView(
        scrollboxRef.current,
        selectedIndex,
        1,
        attachments.length,
        selectedIndex,
      );
    }
  }, [selectedIndex, attachments.length]);

  const openSelected = async () => {
    const selected = attachments[selectedIndex];
    if (!selected) return;
    const absolutePath = await resolveAttachmentPath(selected);
    if (!absolutePath) {
      setStatusMessage(t(keys.STATUS_ATTACHMENT_OPEN_FAILED));
      return;
    }
    if (openPathWithSystemApp(absolutePath)) {
      setStatusMessage(
        t(keys.STATUS_ATTACHMENT_OPENED, {
          filename: displayName(selected),
        }),
      );
    } else {
      setStatusMessage(t(keys.STATUS_ATTACHMENT_OPEN_FAILED));
    }
  };

  const revealFolder = () => {
    if (openPathWithSystemApp(getAttachmentsDir())) {
      setStatusMessage(
        t(keys.STATUS_ATTACHMENT_OPENED, { filename: "attachments/" }),
      );
    } else {
      setStatusMessage(t(keys.STATUS_ATTACHMENT_OPEN_FAILED));
    }
  };

  useBindings(
    () => ({
      priority: 100,
      enabled: isOpen,
      commands: [
        {
          name: "attachments.previous",
          run: () => {
            setSelectedIndex((prev) =>
              prev > 0 ? prev - 1 : Math.max(0, attachments.length - 1),
            );
          },
        },
        {
          name: "attachments.next",
          run: () => {
            setSelectedIndex((prev) =>
              prev < attachments.length - 1 ? prev + 1 : 0,
            );
          },
        },
        { name: "attachments.open", run: () => void openSelected() },
        { name: "attachments.reveal", run: revealFolder },
        { name: "attachments.close", run: onClose },
      ],
      bindings: [
        {
          key: "up, k, ctrl+k, ctrl+p",
          cmd: "attachments.previous",
          desc: "Previous attachment",
        },
        {
          key: "down, j, ctrl+j, ctrl+n",
          cmd: "attachments.next",
          desc: "Next attachment",
        },
        {
          key: "return",
          cmd: "attachments.open",
          desc: "Open attachment",
        },
        {
          key: "f",
          cmd: "attachments.reveal",
          desc: "Reveal attachments folder",
        },
        {
          key: "escape",
          cmd: "attachments.close",
          desc: "Close attachments",
        },
      ],
    }),
    [isOpen, attachments, selectedIndex, openSelected, revealFolder, onClose],
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
      top={2}
      left="20%"
      width="60%"
      height="60%"
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
          <text fg={theme.accent.primary}>
            {t(keys.EDITOR_ATTACHMENTS_TITLE)}
          </text>
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
        flexDirection="column"
        padding={1}
        backgroundColor={theme.bg.panel}
        flexGrow={1}
        width="100%"
      >
        <box
          flexDirection="row"
          justifyContent="space-between"
          marginBottom={1}
        >
          <text fg={theme.accent.primary}>
            {`┌─ ${t(keys.EDITOR_ATTACHMENTS_TITLE)} (${attachments.length}) ─`}
          </text>
        </box>

        {attachments.length === 0 ? (
          <box justifyContent="center" alignItems="center" flexGrow={1}>
            <text fg={theme.text.dim}>{t(keys.EDITOR_ATTACHMENTS_EMPTY)}</text>
          </box>
        ) : (
          <scrollbox
            ref={scrollboxRef}
            flexGrow={1}
            scrollY={true}
            scrollX={false}
            verticalScrollbarOptions={getScrollbarOptions(theme, true)}
          >
            {attachments.map((attachment, idx) => {
              const isSelected = selectedIndex === idx;
              const prefix = idx === attachments.length - 1
                ? "└── "
                : "├── ";
              const name = displayName(attachment);
              const maxLen = Math.max(14, 30 - prefix.length);

              return (
                <box
                  key={`${attachment}:${idx}`}
                  flexDirection="row"
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={isSelected ? theme.bg.selected : undefined}
                  alignItems="center"
                  width="100%"
                >
                  <text fg={theme.text.dim}>{prefix}</text>
                  <MarqueeText
                    text={name}
                    maxLength={maxLen}
                    isSelected={isSelected}
                    isFocused={true}
                    fg={
                      isSelected ? theme.accent.primary : theme.accent.cyan
                    }
                  />
                </box>
              );
            })}
          </scrollbox>
        )}
      </box>

      <box
        flexDirection="row"
        justifyContent="center"
        alignItems="center"
        flexShrink={0}
      >
        <text fg={theme.text.dim}>{t(keys.EDITOR_ATTACHMENTS_HINT)}</text>
      </box>
    </box>
  );
}
