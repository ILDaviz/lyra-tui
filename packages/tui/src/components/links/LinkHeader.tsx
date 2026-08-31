import React from "react";
import { Theme } from "../../theme";
import { useTranslation } from "../../i18n";

interface LinkHeaderProps {
  theme: Theme;
  totalCount: number;
  isFocused: boolean;
}

export function LinkHeader({
  theme,
  totalCount,
  isFocused,
}: LinkHeaderProps): any {
  const { t, keys } = useTranslation();

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      flexShrink={0}
      paddingBottom={1}
      marginBottom={1}
    >
      <box flexDirection="row" gap={2} alignItems="center">
        <text fg={theme.text.highlight}>{t(keys.LINKS_TITLE)}</text>
        <text fg={theme.text.dim}>{`(${totalCount})`}</text>
      </box>
      <box flexDirection="row" gap={2} alignItems="center">
        <text fg={isFocused ? theme.accent.secondary : theme.text.dim}>
          {t(keys.LINKS_ADD_BADGE)}
        </text>
        <text fg={isFocused ? theme.accent.purple : theme.text.dim}>
          {t(keys.LINKS_DELETE_BADGE)}
        </text>
      </box>
    </box>
  );
}
