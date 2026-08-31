import React from "react";
import { useTranslation } from "../../i18n";
import { useTheme } from "../../theme";

export function EditorEmpty(): any {
  const theme = useTheme();
  const { t, keys } = useTranslation();

  return (
    <box
      borderStyle="rounded"
      borderColor={theme.border.subtle}
      flexGrow={1}
      flexShrink={1}
      height="100%"
      justifyContent="center"
      alignItems="center"
      flexDirection="column"
      gap={1}
      backgroundColor={theme.bg.panelAlt}
    >
      <text fg={theme.accent.cyan}>
        <b>LYRA</b>
      </text>
      <text fg={theme.text.dim}>{t(keys.EDITOR_NO_NOTE_TITLE)}</text>
      <text fg={theme.text.faint}>{t(keys.EDITOR_NO_NOTE_HINT)}</text>
    </box>
  );
}
