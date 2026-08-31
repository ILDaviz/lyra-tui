import React from "react";
import { useAppStore } from "../store";
import { useTranslation } from "../i18n";
import { useTheme } from "../theme";

export function CopyPopup(): any {
  const theme = useTheme();
  const copyPopup = useAppStore((s) => s.copyPopup);
  const { t, keys } = useTranslation();

  if (!copyPopup.visible) return null;

  return (
    <box
      position="absolute"
      top={2}
      left="35%"
      width="30%"
      height={3}
      borderStyle="rounded"
      borderColor={theme.border.success}
      backgroundColor={theme.bg.panel}
      justifyContent="center"
      alignItems="center"
      flexDirection="row"
      paddingLeft={1}
      paddingRight={1}
      zIndex={999}
    >
      <text fg={theme.text.primary}>
        {copyPopup.message || t(keys.POPUP_COPIED)}
      </text>
    </box>
  );
}
