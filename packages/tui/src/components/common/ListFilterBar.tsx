import React from "react";
import { useTranslation } from "../../i18n";
import type { Theme } from "../../theme";

interface ListFilterBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  isActive: boolean;
  totalCount: number;
  filteredCount: number;
  theme: Theme;
}

export function ListFilterBar({
  query,
  onQueryChange,
  isActive,
  totalCount,
  filteredCount,
  theme,
}: ListFilterBarProps): any {
  const { t, keys } = useTranslation();
  if (!isActive && !query) return null;

  return (
    <box
      flexDirection="row"
      marginBottom={1}
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={theme.bg.input}
      flexShrink={0}
    >
      <text fg={theme.accent.primary}>{"/ "}</text>
      <input
        focused={isActive}
        value={query}
        onInput={onQueryChange}
        placeholder={t(keys.LIST_FILTER_PLACEHOLDER)}
        flexGrow={1}
      />
      <text fg={theme.text.dim}>{` ${filteredCount}/${totalCount}`}</text>
    </box>
  );
}
