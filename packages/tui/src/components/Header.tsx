import React from "react";
import { getNodeEnv } from "@lyratui/core";
import { useAppStore } from "../store";
import { useTranslation } from "../i18n";
import { useTheme } from "../theme";

export function Header(): any {
  const theme = useTheme();
  const viewMode = useAppStore((s) => s.viewMode);
  const activeFolder = useAppStore((s) => s.activeFolder);
  const activeNote = useAppStore((s) => s.activeNote);
  const { t, keys } = useTranslation();

  let breadcrumb = t(keys.HEADER_BREADCRUMB_NOTES);
  if (viewMode === "notes") {
    breadcrumb =
      activeFolder === "/" ? t(keys.HEADER_BREADCRUMB_ROOT) : activeFolder;
  } else if (viewMode === "myday") {
    breadcrumb = t(keys.HEADER_BREADCRUMB_MYDAY);
  } else if (viewMode === "todos") {
    breadcrumb = t(keys.HEADER_BREADCRUMB_TODOS);
  } else if (viewMode === "links") {
    breadcrumb = t(keys.HEADER_BREADCRUMB_LINKS);
  }

  const isDev = getNodeEnv() === "development";

  return (
    <box
      borderStyle="rounded"
      borderColor={theme.border.subtle}
      height={3}
      flexShrink={0}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={theme.bg.panel}
    >
      <box flexDirection="row" gap={1} alignItems="center">
        <text fg={theme.accent.cyan}>
          <b>LYRA</b>
        </text>
        {isDev ? <text fg={theme.accent.primary}>[DEV]</text> : null}
        <text fg={theme.text.faint}>│</text>
        <text fg={theme.accent.secondary}>{breadcrumb}</text>
      </box>

      <box flexDirection="row" gap={2} alignItems="center">
        {activeNote ? (
          <box flexDirection="row" gap={1} alignItems="center">
            <text fg={theme.text.dim}>{t(keys.HEADER_NOTE_PREFIX)}</text>
            <text
              fg={activeNote.isDirty ? theme.accent.yellow : theme.accent.green}
            >
              {activeNote.title}
            </text>
            {activeNote.isDirty ? (
              <text fg={theme.accent.primary}>
                {t(keys.HEADER_STATUS_MODIFIED)}
              </text>
            ) : (
              <text fg={theme.status.done}>{t(keys.HEADER_STATUS_SAVED)}</text>
            )}
          </box>
        ) : (
          <text fg={theme.text.faint}>{t(keys.HEADER_NO_ACTIVE_NOTE)}</text>
        )}
      </box>
    </box>
  );
}
