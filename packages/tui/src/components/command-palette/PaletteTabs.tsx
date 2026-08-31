import React from "react";
import { PaletteTab, SearchMode } from "./types";
import { Theme } from "../../theme";
import { useTranslation } from "../../i18n";

interface PaletteTabsProps {
  activeTab: PaletteTab;
  searchMode: SearchMode;
  theme: Theme;
}

export function PaletteTabs({
  activeTab,
  searchMode,
  theme,
}: PaletteTabsProps): any {
  const { t, keys } = useTranslation();

  return (
    <box flexDirection="row" gap={1} marginBottom={1}>
      <box
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={
          activeTab === "commands"
            ? theme.bg.buttonPrimary
            : theme.bg.selectedAlt
        }
      >
        <text
          fg={activeTab === "commands" ? theme.text.primary : theme.text.muted}
        >
          {t(keys.PALETTE_TAB_COMMANDS)}
        </text>
      </box>
      <box
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={
          activeTab === "search" ? theme.bg.buttonPrimary : theme.bg.selectedAlt
        }
      >
        <text
          fg={activeTab === "search" ? theme.text.primary : theme.text.muted}
        >
          {t(keys.PALETTE_TAB_SEARCH)}
        </text>
      </box>
      {activeTab === "search" ? (
        <text fg={theme.text.dim}>
          {" "}
          Mode:{" "}
          <span
            fg={searchMode === "text" ? theme.accent.primary : theme.text.dim}
          >
            {t(keys.PALETTE_SEARCH_MODE_TEXT)}
          </span>{" "}
          <span
            fg={
              searchMode === "semantic" ? theme.accent.purple : theme.text.dim
            }
          >
            {t(keys.PALETTE_SEARCH_MODE_SEMANTIC)}
          </span>{" "}
          <span
            fg={
              searchMode === "hybrid" ? theme.accent.secondary : theme.text.dim
            }
          >
            {t(keys.PALETTE_SEARCH_MODE_HYBRID)}
          </span>
        </text>
      ) : null}
    </box>
  );
}
