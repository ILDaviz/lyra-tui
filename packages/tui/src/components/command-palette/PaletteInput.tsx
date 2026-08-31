import React from "react";
import { PaletteTab, SearchMode } from "./types";
import { Theme } from "../../theme";
import { useTranslation } from "../../i18n";

interface PaletteInputProps {
  inputRef: any;
  query: string;
  activeTab: PaletteTab;
  searchMode: SearchMode;
  theme: Theme;
  onInput: (val: string) => void;
}

export function PaletteInput({
  inputRef,
  query,
  activeTab,
  searchMode,
  theme,
  onInput,
}: PaletteInputProps): any {
  const { t, keys } = useTranslation();

  return (
    <box
      borderStyle="rounded"
      borderColor={theme.border.subtle}
      paddingLeft={1}
      marginBottom={1}
      backgroundColor={theme.bg.input}
    >
      <input
        ref={inputRef}
        focused={true}
        value={query}
        onInput={onInput}
        placeholder={
          activeTab === "commands"
            ? t(keys.PALETTE_INPUT_PLACEHOLDER_CMD)
            : t(keys.PALETTE_INPUT_PLACEHOLDER_SEARCH, { mode: searchMode })
        }
      />
    </box>
  );
}
