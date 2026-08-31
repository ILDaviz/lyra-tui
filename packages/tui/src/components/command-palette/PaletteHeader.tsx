import React from "react";
import { Theme } from "../../theme";
import { useTranslation } from "../../i18n";

interface PaletteHeaderProps {
  theme: Theme;
}

export function PaletteHeader({ theme }: PaletteHeaderProps): any {
  const { t, keys } = useTranslation();

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      marginBottom={1}
    >
      <box flexDirection="row" gap={1} alignItems="center">
        <text fg={theme.accent.primary}>{t(keys.PALETTE_TITLE)}</text>
      </box>
      <text fg={theme.text.dim}>{t(keys.PALETTE_HINT)}</text>
    </box>
  );
}
