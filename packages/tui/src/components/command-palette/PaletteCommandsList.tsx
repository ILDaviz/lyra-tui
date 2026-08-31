import React from "react";
import { SearchItem } from "./types";
import { Theme, getScrollbarOptions } from "../../theme";
import { useTranslation } from "../../i18n";

interface PaletteCommandsListProps {
  scrollboxRef: any;
  visibleResults: SearchItem[];
  selectedIndex: number;
  isSearching: boolean;
  searchError: string | null;
  theme: Theme;
}

export function PaletteCommandsList({
  scrollboxRef,
  visibleResults,
  selectedIndex,
  isSearching,
  searchError,
  theme,
}: PaletteCommandsListProps): any {
  const { t, keys } = useTranslation();

  return (
    <scrollbox
      ref={scrollboxRef}
      flexGrow={1}
      scrollY={true}
      scrollX={false}
      verticalScrollbarOptions={getScrollbarOptions(theme, true)}
    >
      {isSearching ? (
        <box paddingLeft={1}>
          <text fg={theme.text.dim}>{t(keys.PALETTE_SEARCHING)}</text>
        </box>
      ) : null}

      {!isSearching && searchError ? (
        <box paddingLeft={1}>
          <text fg={theme.text.error}>{searchError}</text>
        </box>
      ) : null}

      {!isSearching && !searchError && visibleResults.length === 0 ? (
        <box paddingLeft={1}>
          <text fg={theme.text.dim}>{t(keys.PALETTE_NO_RESULTS)}</text>
        </box>
      ) : null}

      {visibleResults.map((cmd, idx) => {
        const isSelected = selectedIndex === idx;
        const prefix = isSelected ? "▸ " : "  ";

        return (
          <box
            key={cmd.id}
            id={`palette-item-${cmd.id}`}
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            width="100%"
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={isSelected ? theme.bg.selected : undefined}
          >
            <text fg={isSelected ? theme.text.highlight : theme.text.secondary}>
              {`${prefix}${cmd.title}`}
            </text>
            <text fg={isSelected ? theme.accent.primary : theme.text.dim}>
              {`[${cmd.category}]`}
            </text>
          </box>
        );
      })}
    </scrollbox>
  );
}
