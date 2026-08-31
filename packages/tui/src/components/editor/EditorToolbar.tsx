import React from "react";
import { useTheme } from "../../theme";
import { useTranslation } from "../../i18n";

export function EditorToolbar(): any {
  const theme = useTheme();
  const { t, keys } = useTranslation();

  return (
    <box flexDirection="row" alignItems="center" marginTop={1}>
      <text fg={theme.text.dim}>
        <span fg={theme.accent.secondary}>[^B]</span>{" "}
        {t(keys.EDITOR_TOOLBAR_BOLD)}         <span fg={theme.accent.cyan}>[^W]</span>{" "}
        {t(keys.EDITOR_TOOLBAR_WIKILINK)}{" "}
        <span fg={theme.accent.green}>[^O]</span>{" "}
        {t(keys.EDITOR_TOOLBAR_ATTACH)}{" "}
        <span fg={theme.accent.secondary}>[^L]</span>{" "}
        {t(keys.EDITOR_TOOLBAR_URL)}{" "}
        <span fg={theme.accent.secondary}>[^T]</span>{" "}
        {t(keys.EDITOR_TOOLBAR_TODO)}{" "}
        <span fg={theme.accent.secondary}>[^C]</span>{" "}
        {t(keys.EDITOR_TOOLBAR_COPY)}{" "}
        <span fg={theme.accent.secondary}>[^V]</span>{" "}
        {t(keys.EDITOR_PASTE_CLIPBOARD)}{" "}
        <span fg={theme.accent.green}>[^S]</span> {t(keys.EDITOR_TOOLBAR_SAVE)}{" "}
        <span fg={theme.text.dim}>[Esc]</span> {t(keys.EDITOR_TOOLBAR_EXIT)}
      </text>
    </box>
  );
}
