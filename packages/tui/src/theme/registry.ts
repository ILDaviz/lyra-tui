import type { Theme } from "./types";
import { darkTheme } from "./palettes/dark";
import { lightTheme } from "./palettes/light";
import { draculaTheme } from "./palettes/dracula";
import { nordTheme } from "./palettes/nord";
import { catppuccinTheme } from "./palettes/catppuccin";
import { tokyoNightTheme } from "./palettes/tokyo-night";
import { monokaiTheme } from "./palettes/monokai";
import { isOmarchyEnvironment, loadOmarchyTheme } from "./omarchy";

const THEMES: Record<string, Theme> = {
  dark: darkTheme,
  light: lightTheme,
  dracula: draculaTheme,
  nord: nordTheme,
  catppuccin: catppuccinTheme,
  "tokyo-night": tokyoNightTheme,
  monokai: monokaiTheme,
};

// Check if running on an Omarchy system and register initial theme
if (typeof process !== "undefined" && isOmarchyEnvironment()) {
  const omarchy = loadOmarchyTheme();
  if (omarchy) {
    THEMES["omarchy"] = omarchy;
  }
}

let activeTheme: Theme = THEMES["omarchy"] || darkTheme;

export function getTheme(id?: string): Theme {
  if (!id) return activeTheme;
  if (id === "omarchy") {
    if (!THEMES["omarchy"]) {
      const omarchy = loadOmarchyTheme();
      if (omarchy) {
        THEMES["omarchy"] = omarchy;
      }
    }
    return THEMES["omarchy"] || darkTheme;
  }
  return THEMES[id] || darkTheme;
}

export function listThemes(): Theme[] {
  // If omarchy theme exists, place it at the top
  if (THEMES["omarchy"]) {
    const { omarchy, ...rest } = THEMES;
    return [omarchy, ...Object.values(rest)];
  }
  return Object.values(THEMES);
}

export function registerTheme(theme: Theme): void {
  THEMES[theme.id] = theme;
  if (activeTheme.id === theme.id) {
    activeTheme = theme;
  }
}

export function refreshOmarchyTheme(): Theme | null {
  const omarchy = loadOmarchyTheme();
  if (omarchy) {
    registerTheme(omarchy);
    return omarchy;
  }
  return null;
}

export function setActiveTheme(id: string): Theme {
  const t = getTheme(id);
  activeTheme = t;
  return t;
}

export function getActiveTheme(): Theme {
  return activeTheme;
}
