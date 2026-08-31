import { useAppStore } from "../store";
import { getTheme } from "./registry";
import type { Theme } from "./types";

export function useTheme(): Theme {
  const activeTheme = useAppStore((state) => state.activeTheme);
  const themeId = useAppStore((state) => state.themeId);
  return activeTheme || getTheme(themeId);
}
