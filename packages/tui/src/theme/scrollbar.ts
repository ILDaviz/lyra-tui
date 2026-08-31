import type { Theme } from "./types";
import { useTheme } from "./useTheme";

export function getScrollbarOptions(theme: Theme, isFocused: boolean = false) {
  return {
    showArrows: false,
    trackOptions: {
      foregroundColor: isFocused ? theme.border.focus : theme.border.strong,
      backgroundColor: theme.bg.panelAlt,
    },
  };
}

export function useScrollbarOptions(isFocused: boolean = false) {
  const theme = useTheme();
  return getScrollbarOptions(theme, isFocused);
}
