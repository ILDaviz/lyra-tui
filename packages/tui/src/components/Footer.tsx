import React from "react";
import { useAppStore } from "../store";
import { useTranslation } from "../i18n";
import { useTheme } from "../theme";

export function Footer(): any {
  const theme = useTheme();
  const statusMessage = useAppStore((s) => s.statusMessage);
  const activePane = useAppStore((s) => s.activePane);
  const { t, keys } = useTranslation();

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
        <text fg={theme.text.dim}>{t(keys.FOOTER_STATUS_LABEL)}</text>
        <text fg={theme.text.secondary}>{statusMessage}</text>
      </box>

      <box flexDirection="row" gap={2} alignItems="center">
        <box flexDirection="row" gap={1} alignItems="center">
          <text fg={theme.text.dim}>{t(keys.FOOTER_FOCUS_LABEL)}</text>
          <text
            fg={theme.accent.primary}
          >{`[${activePane.toUpperCase()}]`}</text>
        </box>
        <text fg={theme.text.faint}>│</text>
        <text fg={theme.text.muted}>
          <span fg={theme.accent.secondary}>[Ctrl+H]</span>{" "}
          {t(keys.FOOTER_INFO_SHORTCUT)}{" "}
          <span fg={theme.accent.primary}>[Tab]</span>{" "}
          {t(keys.FOOTER_FOCUS_SHORTCUT)}{" "}
          <span fg={theme.accent.primary}>[Ctrl+P]</span>{" "}
          {t(keys.FOOTER_CMDS_SHORTCUT)}{" "}
          <span fg={theme.accent.primary}>[Ctrl+Q]</span>{" "}
          {t(keys.FOOTER_QUIT_SHORTCUT)}
        </text>
      </box>
    </box>
  );
}
