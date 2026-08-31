import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Theme } from "./types";

export const OMARCHY_LYRA_TEMPLATE_CONTENT = `{
  "id": "omarchy",
  "name": "Omarchy",
  "displayName": "Omarchy (System)",
  "isDark": true,
  "bg": {
    "app": "{{ background }}",
    "panel": "{{ dark_background }}",
    "panelAlt": "{{ darker_background }}",
    "input": "{{ mix background foreground 8% }}",
    "selected": "{{ selection }}",
    "selectedAlt": "{{ mix background selection 50% }}",
    "highlight": "{{ mix background foreground 12% }}",
    "codeBlock": "{{ dark_background }}",
    "codeBlockHeader": "{{ mix dark_background foreground 10% }}",
    "badge": "{{ mix background foreground 15% }}",
    "badgeActive": "{{ mix background accent 25% }}",
    "aiBanner": "{{ mix background magenta 15% }}",
    "aiBannerSelected": "{{ mix background magenta 30% }}",
    "aiPrompt": "{{ mix background magenta 20% }}",
    "aiProposal": "{{ mix background yellow 15% }}",
    "buttonPrimary": "{{ accent }}",
    "buttonSecondary": "{{ mix background foreground 10% }}",
    "buttonDanger": "{{ red }}",
    "buttonSuccess": "{{ green }}",
    "buttonAi": "{{ magenta }}"
  },
  "border": {
    "subtle": "{{ mix background foreground 15% }}",
    "default": "{{ muted }}",
    "strong": "{{ mix background foreground 35% }}",
    "focus": "{{ accent }}",
    "info": "{{ cyan }}",
    "ai": "{{ magenta }}",
    "aiDeep": "{{ mix background magenta 40% }}",
    "success": "{{ green }}",
    "error": "{{ red }}"
  },
  "text": {
    "primary": "{{ foreground }}",
    "secondary": "{{ light_foreground }}",
    "muted": "{{ muted }}",
    "dim": "{{ dark_foreground }}",
    "faint": "{{ mix background foreground 30% }}",
    "inverse": "{{ background }}",
    "highlight": "{{ bright_foreground }}",
    "warning": "{{ yellow }}",
    "success": "{{ green }}",
    "error": "{{ red }}",
    "ai": "{{ magenta }}",
    "link": "{{ blue }}"
  },
  "accent": {
    "primary": "{{ accent }}",
    "primaryLight": "{{ mix accent foreground 30% }}",
    "secondary": "{{ cyan }}",
    "cyan": "{{ cyan }}",
    "purple": "{{ magenta }}",
    "purpleDark": "{{ mix background magenta 40% }}",
    "purpleLight": "{{ mix magenta foreground 30% }}",
    "green": "{{ green }}",
    "greenDark": "{{ mix background green 50% }}",
    "red": "{{ red }}",
    "redDark": "{{ mix background red 50% }}",
    "yellow": "{{ yellow }}",
    "blue": "{{ blue }}",
    "blueDark": "{{ mix background blue 50% }}"
  },
  "status": {
    "todo": "{{ muted }}",
    "inProgress": "{{ cyan }}",
    "urgent": "{{ red }}",
    "question": "{{ magenta }}",
    "paused": "{{ dark_foreground }}",
    "cancelled": "{{ dark_foreground }}",
    "done": "{{ green }}",
    "priorityHigh": "{{ red }}",
    "priorityMedium": "{{ yellow }}",
    "priorityLow": "{{ blue }}"
  },
  "syntax": {
    "h1": "{{ accent }}",
    "h2": "{{ cyan }}",
    "h3": "{{ magenta }}",
    "h4": "{{ green }}",
    "bold": "{{ bright_foreground }}",
    "italic": "{{ light_foreground }}",
    "code": "{{ red }}",
    "codeBg": "{{ mix background foreground 8% }}",
    "link": "{{ blue }}",
    "list": "{{ muted }}",
    "quote": "{{ muted }}",
    "table": "{{ foreground }}",
    "keyword": "{{ magenta }}",
    "string": "{{ green }}",
    "stringSpecial": "{{ cyan }}",
    "number": "{{ cyan }}",
    "comment": "{{ muted }}",
    "constant": "{{ yellow }}",
    "function": "{{ blue }}",
    "type": "{{ yellow }}",
    "tag": "{{ red }}",
    "attribute": "{{ yellow }}",
    "parameter": "{{ foreground }}",
    "punctuation": "{{ dark_foreground }}",
    "default": "{{ foreground }}"
  }
}
`;

/**
 * Mix two hex colors by amount (e.g. 0.15 or "15%").
 */
export function mixColorHex(
  startHex: string,
  endHex: string,
  amount: number | string,
): string {
  let amt: number;
  if (typeof amount === "string") {
    const trimmed = amount.trim();
    if (trimmed.endsWith("%")) {
      amt = parseFloat(trimmed.slice(0, -1)) / 100;
    } else {
      amt = parseFloat(trimmed);
      if (amt > 1) amt = amt / 100;
    }
  } else {
    amt = amount;
    if (amt > 1) amt = amt / 100;
  }

  if (isNaN(amt)) amt = 0;
  amt = Math.max(0, Math.min(1, amt));

  const cleanStart = (startHex || "#000000").replace("#", "").trim();
  const cleanEnd = (endHex || "#FFFFFF").replace("#", "").trim();

  const parseChannel = (hex: string, idx: number) => {
    const sub = hex.substring(idx, idx + 2);
    return parseInt(sub || "00", 16) || 0;
  };

  const sR = parseChannel(cleanStart, 0);
  const sG = parseChannel(cleanStart, 2);
  const sB = parseChannel(cleanStart, 4);

  const eR = parseChannel(cleanEnd, 0);
  const eG = parseChannel(cleanEnd, 2);
  const eB = parseChannel(cleanEnd, 4);

  const r = Math.round(sR * (1 - amt) + eR * amt);
  const g = Math.round(sG * (1 - amt) + eG * amt);
  const b = Math.round(sB * (1 - amt) + eB * amt);

  const toHex = (val: number) =>
    Math.max(0, Math.min(255, val)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Returns true if the current environment is an Omarchy system.
 */
export function isOmarchyEnvironment(): boolean {
  const home = os.homedir();
  const pathsToCheck = [
    path.join(home, ".local", "state", "omarchy"),
    path.join(home, ".config", "omarchy"),
    "/usr/share/omarchy",
  ];

  for (const p of pathsToCheck) {
    try {
      if (fs.existsSync(p)) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

export function getOmarchyCurrentThemeDir(): string {
  return path.join(
    os.homedir(),
    ".local",
    "state",
    "omarchy",
    "current",
    "theme",
  );
}

export function getOmarchyUserThemedDir(): string {
  return path.join(os.homedir(), ".config", "omarchy", "themed");
}

/**
 * Ensures the Lyra-TUI template is installed in ~/.config/omarchy/themed/lyra.json.tpl
 */
export function ensureOmarchyTemplateInstalled(): boolean {
  try {
    const themedDir = getOmarchyUserThemedDir();
    const tplPath = path.join(themedDir, "lyra.json.tpl");

    if (!fs.existsSync(themedDir)) {
      fs.mkdirSync(themedDir, { recursive: true });
    }

    if (!fs.existsSync(tplPath)) {
      fs.writeFileSync(tplPath, OMARCHY_LYRA_TEMPLATE_CONTENT, "utf-8");
      return true;
    }
  } catch (err) {
    console.error("Failed to install Omarchy template:", err);
  }
  return false;
}

/**
 * Parse an Omarchy colors.toml content into a fully formed Theme object.
 */
export function parseOmarchyColorsToml(tomlContent: string): Theme {
  const vars: Record<string, string> = {};

  const lines = tomlContent.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("[")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.substring(0, eqIdx).trim();
    let val = line.substring(eqIdx + 1).trim();

    // Strip quotes or trailing comments
    if (val.startsWith('"') || val.startsWith("'")) {
      const quoteChar = val[0];
      const closeIdx = val.indexOf(quoteChar, 1);
      if (closeIdx !== -1) {
        val = val.substring(1, closeIdx);
      }
    } else {
      const commentIdx = val.indexOf("#");
      if (commentIdx !== -1) {
        val = val.substring(0, commentIdx).trim();
      }
    }

    vars[key] = val;
  }

  const isDark = (vars.mode || "dark").toLowerCase() !== "light";

  const bg = vars.background || (isDark ? "#0c0b0c" : "#fafcfb");
  const darkBg = vars.dark_background || (isDark ? "#090809" : "#f0f2f1");
  const darkerBg = vars.darker_background || (isDark ? "#060606" : "#e6e8e7");
  const fg = vars.foreground || (isDark ? "#FAFCFB" : "#0c0b0c");
  const darkFg = vars.dark_foreground || (isDark ? "#584e51" : "#8a8588");
  const lightFg = vars.light_foreground || (isDark ? "#cfd3cd" : "#454143");
  const brightFg = vars.bright_foreground || (isDark ? "#e2dddc" : "#1a1819");

  const accent = vars.accent || (isDark ? "#b59790" : "#7c5c56");
  const selection = vars.selection || (isDark ? "#584e51" : "#d8d4d5");
  const muted = vars.muted || (isDark ? "#584e51" : "#8a8588");

  const red = vars.red || "#c38b7b";
  const green = vars.green || "#87a9b0";
  const yellow = vars.yellow || "#6B5E73";
  const blue = vars.blue || "#b59790";
  const magenta = vars.magenta || "#c4d8e2";
  const cyan = vars.cyan || "#a5a0b6";

  return {
    id: "omarchy",
    name: "Omarchy",
    displayName: "Omarchy (System)",
    isDark,
    bg: {
      app: bg,
      panel: darkBg,
      panelAlt: darkerBg,
      input: mixColorHex(bg, fg, 0.08),
      selected: selection,
      selectedAlt: mixColorHex(bg, selection, 0.5),
      highlight: mixColorHex(bg, fg, 0.12),
      codeBlock: darkBg,
      codeBlockHeader: mixColorHex(darkBg, fg, 0.1),
      badge: mixColorHex(bg, fg, 0.15),
      badgeActive: mixColorHex(bg, accent, 0.25),
      aiBanner: mixColorHex(bg, magenta, 0.15),
      aiBannerSelected: mixColorHex(bg, magenta, 0.3),
      aiPrompt: mixColorHex(bg, magenta, 0.2),
      aiProposal: mixColorHex(bg, yellow, 0.15),
      buttonPrimary: accent,
      buttonSecondary: mixColorHex(bg, fg, 0.1),
      buttonDanger: red,
      buttonSuccess: green,
      buttonAi: magenta,
    },
    border: {
      subtle: mixColorHex(bg, fg, 0.15),
      default: muted,
      strong: mixColorHex(bg, fg, 0.35),
      focus: accent,
      info: cyan,
      ai: magenta,
      aiDeep: mixColorHex(bg, magenta, 0.4),
      success: green,
      error: red,
    },
    text: {
      primary: fg,
      secondary: lightFg,
      muted: muted,
      dim: darkFg,
      faint: mixColorHex(bg, fg, 0.3),
      inverse: bg,
      highlight: brightFg,
      warning: yellow,
      success: green,
      error: red,
      ai: magenta,
      link: blue,
    },
    accent: {
      primary: accent,
      primaryLight: mixColorHex(accent, fg, 0.3),
      secondary: cyan,
      cyan: cyan,
      purple: magenta,
      purpleDark: mixColorHex(bg, magenta, 0.4),
      purpleLight: mixColorHex(magenta, fg, 0.3),
      green: green,
      greenDark: mixColorHex(bg, green, 0.5),
      red: red,
      redDark: mixColorHex(bg, red, 0.5),
      yellow: yellow,
      blue: blue,
      blueDark: mixColorHex(bg, blue, 0.5),
    },
    status: {
      todo: muted,
      inProgress: cyan,
      urgent: red,
      question: magenta,
      paused: darkFg,
      cancelled: darkFg,
      done: green,
      priorityHigh: red,
      priorityMedium: yellow,
      priorityLow: blue,
    },
    syntax: {
      h1: accent,
      h2: cyan,
      h3: magenta,
      h4: green,
      bold: brightFg,
      italic: lightFg,
      code: red,
      codeBg: mixColorHex(bg, fg, 0.08),
      link: blue,
      list: muted,
      quote: muted,
      table: fg,
      keyword: magenta,
      string: green,
      stringSpecial: cyan,
      number: cyan,
      comment: muted,
      constant: yellow,
      function: blue,
      type: yellow,
      tag: red,
      attribute: yellow,
      parameter: fg,
      punctuation: darkFg,
      default: fg,
    },
  };
}

/**
 * Load the active Omarchy theme, preferring lyra.json then falling back to colors.toml.
 */
export function loadOmarchyTheme(): Theme | null {
  try {
    const themeDir = getOmarchyCurrentThemeDir();
    const lyraJsonPath = path.join(themeDir, "lyra.json");
    const colorsTomlPath = path.join(themeDir, "colors.toml");

    if (fs.existsSync(lyraJsonPath)) {
      const raw = fs.readFileSync(lyraJsonPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.bg && parsed.text) {
        return {
          ...parsed,
          id: "omarchy",
          name: "Omarchy",
          displayName: "Omarchy (System)",
          isDark: typeof parsed.isDark === "boolean" ? parsed.isDark : true,
        } as Theme;
      }
    }

    if (fs.existsSync(colorsTomlPath)) {
      const raw = fs.readFileSync(colorsTomlPath, "utf-8");
      return parseOmarchyColorsToml(raw);
    }
  } catch (err) {
    console.error("Failed to load Omarchy theme:", err);
  }
  return null;
}

/**
 * Watch for Omarchy theme changes and invoke the callback with the updated Theme.
 */
export function watchOmarchyTheme(
  onThemeChanged: (theme: Theme) => void,
): () => void {
  const themeDir = getOmarchyCurrentThemeDir();
  const currentDir = path.dirname(themeDir);
  const themeNamePath = path.join(currentDir, "theme.name");
  const colorsTomlPath = path.join(themeDir, "colors.toml");
  const lyraJsonPath = path.join(themeDir, "lyra.json");

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  const watchers: fs.FSWatcher[] = [];

  let lastSignature = "";

  const getThemeSignature = (): string => {
    let sig = "";
    try {
      if (fs.existsSync(themeNamePath)) {
        sig += fs.readFileSync(themeNamePath, "utf-8").trim();
      }
    } catch {
      // ignore
    }
    try {
      if (fs.existsSync(lyraJsonPath)) {
        const st = fs.statSync(lyraJsonPath);
        sig += `:${st.mtimeMs}`;
      } else if (fs.existsSync(colorsTomlPath)) {
        const st = fs.statSync(colorsTomlPath);
        sig += `:${st.mtimeMs}`;
      }
    } catch {
      // ignore
    }
    return sig;
  };

  lastSignature = getThemeSignature();

  const handleUpdate = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const currentSig = getThemeSignature();
      if (currentSig && currentSig === lastSignature) {
        // No actual change
        return;
      }
      lastSignature = currentSig;

      const updatedTheme = loadOmarchyTheme();
      if (updatedTheme) {
        onThemeChanged(updatedTheme);
      }
    }, 80);
  };

  const setupWatchers = () => {
    try {
      if (fs.existsSync(currentDir)) {
        const w1 = fs.watch(currentDir, (eventType, filename) => {
          if (
            filename === "theme" ||
            filename === "theme.name" ||
            filename === "background" ||
            !filename
          ) {
            handleUpdate();
          }
        });
        watchers.push(w1);
      }

      if (fs.existsSync(themeDir)) {
        const w2 = fs.watch(themeDir, (eventType, filename) => {
          if (
            filename === "lyra.json" ||
            filename === "colors.toml" ||
            !filename
          ) {
            handleUpdate();
          }
        });
        watchers.push(w2);
      }
    } catch (err) {
      console.error("Failed to setup Omarchy filesystem watcher:", err);
    }
  };

  setupWatchers();

  // Polling fallback every 500ms in case inotify handle drops during atomic directory swap
  pollInterval = setInterval(() => {
    const currentSig = getThemeSignature();
    if (currentSig && currentSig !== lastSignature) {
      handleUpdate();
    }
  }, 500);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (pollInterval) clearInterval(pollInterval);
    for (const w of watchers) {
      try {
        w.close();
      } catch {
        // ignore
      }
    }
  };
}
