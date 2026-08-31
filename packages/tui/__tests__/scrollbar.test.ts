import { describe, it, expect } from "vitest";
import { getTheme, listThemes, getScrollbarOptions } from "../src/theme";

describe("Scrollbar Theming & Browser-Style Options", () => {
  it("should generate valid browser-style scrollbar options for default dark theme", () => {
    const dark = getTheme("dark");
    const unfocusedOpts = getScrollbarOptions(dark, false);

    expect(unfocusedOpts.showArrows).toBe(false);
    expect(unfocusedOpts.trackOptions).toBeDefined();
    expect(unfocusedOpts.trackOptions?.foregroundColor).toBe(
      dark.border.strong,
    );
    expect(unfocusedOpts.trackOptions?.backgroundColor).toBe(dark.bg.panelAlt);

    const focusedOpts = getScrollbarOptions(dark, true);
    expect(focusedOpts.showArrows).toBe(false);
    expect(focusedOpts.trackOptions?.foregroundColor).toBe(dark.border.focus);
    expect(focusedOpts.trackOptions?.backgroundColor).toBe(dark.bg.panelAlt);
  });

  it("should generate valid scrollbar options across all registered themes", () => {
    const themes = listThemes();

    for (const theme of themes) {
      const opts = getScrollbarOptions(theme, false);
      expect(opts.showArrows).toBe(false);
      expect(opts.trackOptions?.foregroundColor).toBe(theme.border.strong);
      expect(opts.trackOptions?.backgroundColor).toBe(theme.bg.panelAlt);

      const focusedOpts = getScrollbarOptions(theme, true);
      expect(focusedOpts.trackOptions?.foregroundColor).toBe(
        theme.border.focus,
      );
    }
  });
});
