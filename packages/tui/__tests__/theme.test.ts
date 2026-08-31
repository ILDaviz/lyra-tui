import { describe, it, expect, beforeEach } from "vitest";
import {
  getTheme,
  listThemes,
  registerTheme,
  setActiveTheme,
  getActiveTheme,
  Theme,
} from "../src/theme";
import { useAppStore } from "../src/store";
import { createEditorSyntaxStyle } from "../src/components/editor/syntax";

describe("Theme and Templating System", () => {
  beforeEach(() => {
    setActiveTheme("dark");
    useAppStore.getState().setTheme("dark");
  });

  it("should have all built-in themes registered", () => {
    const themes = listThemes();
    const ids = themes.map((t) => t.id);

    expect(ids).toContain("dark");
    expect(ids).toContain("light");
    expect(ids).toContain("dracula");
    expect(ids).toContain("nord");
    expect(ids).toContain("catppuccin");
    expect(ids).toContain("tokyo-night");
    expect(ids).toContain("monokai");
    expect(themes.length).toBeGreaterThanOrEqual(7);
  });

  it("should ensure every built-in theme has complete and valid tokens", () => {
    const themes = listThemes();
    const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

    themes.forEach((theme) => {
      expect(theme.id).toBeDefined();
      expect(theme.name).toBeDefined();
      expect(theme.displayName).toBeDefined();
      expect(typeof theme.isDark).toBe("boolean");

      expect(theme.bg).toBeDefined();
      Object.entries(theme.bg).forEach(([key, val]) => {
        expect(val, `Theme ${theme.id} bg.${key} is invalid`).toMatch(hexRegex);
      });

      expect(theme.border).toBeDefined();
      Object.entries(theme.border).forEach(([key, val]) => {
        expect(val, `Theme ${theme.id} border.${key} is invalid`).toMatch(
          hexRegex,
        );
      });

      expect(theme.text).toBeDefined();
      Object.entries(theme.text).forEach(([key, val]) => {
        expect(val, `Theme ${theme.id} text.${key} is invalid`).toMatch(
          hexRegex,
        );
      });

      expect(theme.accent).toBeDefined();
      Object.entries(theme.accent).forEach(([key, val]) => {
        expect(val, `Theme ${theme.id} accent.${key} is invalid`).toMatch(
          hexRegex,
        );
      });

      expect(theme.status).toBeDefined();
      Object.entries(theme.status).forEach(([key, val]) => {
        expect(val, `Theme ${theme.id} status.${key} is invalid`).toMatch(
          hexRegex,
        );
      });

      expect(theme.syntax).toBeDefined();
      Object.entries(theme.syntax).forEach(([key, val]) => {
        expect(val, `Theme ${theme.id} syntax.${key} is invalid`).toMatch(
          hexRegex,
        );
      });
    });
  });

  it("should get default dark theme when requested or when id is missing/unknown", () => {
    const dark = getTheme("dark");
    expect(dark.id).toBe("dark");
    expect(dark.isDark).toBe(true);

    const unknown = getTheme("non-existing-theme-xyz");
    expect(unknown.id).toBe("dark");

    const fallback = getTheme();
    expect(fallback.id).toBe("dark");
  });

  it("should support registering and switching to custom themes", () => {
    const customTheme: Theme = {
      id: "custom-matrix",
      name: "Matrix",
      displayName: "Matrix Green",
      isDark: true,
      bg: { ...getTheme("dark").bg, app: "#001100", panel: "#002200" },
      border: { ...getTheme("dark").border, focus: "#00FF00" },
      text: { ...getTheme("dark").text, primary: "#00FF00" },
      accent: { ...getTheme("dark").accent, primary: "#00FF00" },
      status: { ...getTheme("dark").status, done: "#00FF00" },
      syntax: { ...getTheme("dark").syntax, keyword: "#00FF00" },
    };

    registerTheme(customTheme);
    const retrieved = getTheme("custom-matrix");
    expect(retrieved.id).toBe("custom-matrix");
    expect(retrieved.bg.app).toBe("#001100");

    setActiveTheme("custom-matrix");
    expect(getActiveTheme().id).toBe("custom-matrix");
  });

  it("should integrate with Zustand store state and setTheme action", () => {
    expect(useAppStore.getState().themeId).toBe("dark");

    useAppStore.getState().setTheme("dracula");
    expect(useAppStore.getState().themeId).toBe("dracula");
    expect(getActiveTheme().id).toBe("dracula");

    useAppStore.getState().setTheme("nord");
    expect(useAppStore.getState().themeId).toBe("nord");
    expect(getActiveTheme().id).toBe("nord");
  });

  it("should generate SyntaxStyle accurately for different themes", () => {
    const darkStyle = createEditorSyntaxStyle(getTheme("dark"));
    expect(darkStyle).toBeDefined();

    const lightStyle = createEditorSyntaxStyle(getTheme("light"));
    expect(lightStyle).toBeDefined();

    const catppuccinStyle = createEditorSyntaxStyle(getTheme("catppuccin"));
    expect(catppuccinStyle).toBeDefined();
  });
});
