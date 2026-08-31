import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  mixColorHex,
  parseOmarchyColorsToml,
  loadOmarchyTheme,
  ensureOmarchyTemplateInstalled,
  OMARCHY_LYRA_TEMPLATE_CONTENT,
} from "../src/theme/omarchy";
import { getTheme, listThemes, registerTheme } from "../src/theme/registry";
import { useAppStore } from "../src/store";

describe("Omarchy Theme Integration", () => {
  describe("mixColorHex", () => {
    it("should correctly mix two colors with float ratio", () => {
      const mixed = mixColorHex("#000000", "#ffffff", 0.5);
      expect(mixed.toLowerCase()).toBe("#808080");
    });

    it("should correctly mix two colors with percentage string", () => {
      const mixed = mixColorHex("#000000", "#ffffff", "50%");
      expect(mixed.toLowerCase()).toBe("#808080");
    });

    it("should clamp values between 0 and 1", () => {
      expect(mixColorHex("#112233", "#445566", 0).toLowerCase()).toBe(
        "#112233",
      );
      expect(mixColorHex("#112233", "#445566", 1).toLowerCase()).toBe(
        "#445566",
      );
      expect(mixColorHex("#112233", "#445566", -0.5).toLowerCase()).toBe(
        "#112233",
      );
      expect(mixColorHex("#112233", "#445566", "100%").toLowerCase()).toBe(
        "#445566",
      );
    });
  });

  describe("parseOmarchyColorsToml", () => {
    it("should parse a dark mode colors.toml accurately", () => {
      const sampleToml = `
mode = "dark"
accent = "#b59790"
selection = "#584e51"
muted = "#584e51"

background = "#0c0b0c"
dark_background = "#090809"
darker_background = "#060606"
lighter_background = "#0c0b0c"

foreground = "#FAFCFB"
dark_foreground = "#584e51"
light_foreground = "#cfd3cd"
bright_foreground = "#e2dddc"

red = "#c38b7b"
yellow = "#6B5E73"
green = "#87a9b0"
cyan = "#a5a0b6"
blue = "#b59790"
magenta = "#c4d8e2"
`;

      const theme = parseOmarchyColorsToml(sampleToml);
      expect(theme.id).toBe("omarchy");
      expect(theme.name).toBe("Omarchy");
      expect(theme.displayName).toBe("Omarchy (System)");
      expect(theme.isDark).toBe(true);
      expect(theme.bg.app).toBe("#0c0b0c");
      expect(theme.bg.panel).toBe("#090809");
      expect(theme.bg.panelAlt).toBe("#060606");
      expect(theme.text.primary).toBe("#FAFCFB");
      expect(theme.accent.primary).toBe("#b59790");
      expect(theme.accent.cyan).toBe("#a5a0b6");
      expect(theme.status.done).toBe("#87a9b0");
      expect(theme.status.urgent).toBe("#c38b7b");
      expect(theme.syntax.h1).toBe("#b59790");
    });

    it("should parse a light mode colors.toml accurately", () => {
      const sampleToml = `
mode = "light"
accent = "#7c5c56"
selection = "#d8d4d5"
muted = "#8a8588"

background = "#fafcfb"
dark_background = "#f0f2f1"
darker_background = "#e6e8e7"

foreground = "#0c0b0c"
dark_foreground = "#8a8588"
light_foreground = "#454143"
bright_foreground = "#1a1819"

red = "#b85444"
yellow = "#8c7b4f"
green = "#4f8c6b"
cyan = "#4f7b8c"
blue = "#5c6b8c"
magenta = "#8c5c7b"
`;

      const theme = parseOmarchyColorsToml(sampleToml);
      expect(theme.id).toBe("omarchy");
      expect(theme.isDark).toBe(false);
      expect(theme.bg.app).toBe("#fafcfb");
      expect(theme.bg.panel).toBe("#f0f2f1");
      expect(theme.text.primary).toBe("#0c0b0c");
      expect(theme.accent.primary).toBe("#7c5c56");
      expect(theme.syntax.string).toBe("#4f8c6b");
    });
  });

  describe("ensureOmarchyTemplateInstalled", () => {
    it("should contain the required Omarchy placeholders in template", () => {
      expect(OMARCHY_LYRA_TEMPLATE_CONTENT).toContain("{{ background }}");
      expect(OMARCHY_LYRA_TEMPLATE_CONTENT).toContain("{{ foreground }}");
      expect(OMARCHY_LYRA_TEMPLATE_CONTENT).toContain("{{ accent }}");
      expect(OMARCHY_LYRA_TEMPLATE_CONTENT).toContain("{{ mix background");
    });
  });

  describe("Theme Registry with Omarchy", () => {
    it("should allow registering and retrieving the omarchy theme", () => {
      const customTheme = parseOmarchyColorsToml(`
mode = "dark"
accent = "#ff0077"
background = "#121212"
foreground = "#ffffff"
`);
      registerTheme(customTheme);

      const retrieved = getTheme("omarchy");
      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe("omarchy");
      expect(retrieved.accent.primary).toBe("#ff0077");

      const all = listThemes();
      expect(all.some((t) => t.id === "omarchy")).toBe(true);
      expect(all[0].id).toBe("omarchy");
    });
  });

  describe("Zustand Store Reactive Theme Updates", () => {
    it("should reactively update activeTheme and increment themeVersion on theme update", () => {
      const initialVersion = useAppStore.getState().themeVersion;

      const themeA = parseOmarchyColorsToml(`
mode = "dark"
accent = "#112233"
background = "#010101"
`);
      useAppStore.getState().setTheme("omarchy", themeA);

      expect(useAppStore.getState().themeId).toBe("omarchy");
      expect(useAppStore.getState().activeTheme.accent.primary).toBe("#112233");
      expect(useAppStore.getState().themeVersion).toBe(initialVersion + 1);

      // Simulate an external Omarchy live hot-reload
      const themeB = parseOmarchyColorsToml(`
mode = "dark"
accent = "#998877"
background = "#050505"
`);
      useAppStore.getState().setTheme("omarchy", themeB);

      expect(useAppStore.getState().themeId).toBe("omarchy");
      expect(useAppStore.getState().activeTheme.accent.primary).toBe("#998877");
      expect(useAppStore.getState().themeVersion).toBe(initialVersion + 2);
    });
  });
});
