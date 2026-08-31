import { describe, expect, it } from "vitest";
import { I18N_KEYS } from "../src/i18n";
import {
  getContextSection,
  getSearchSections,
  matchesHelpEntry,
} from "../src/components/helpContent";

describe("help content", () => {
  it("uses the focused pane when resolving contextual shortcuts", () => {
    expect(getContextSection("todos", "sidebar", false).id).toBe("navigator");
    expect(getContextSection("todos", "list", false).id).toBe("todos");
    expect(getContextSection("links", "list", false).id).toBe("links");
  });

  it("separates editor viewing and editing shortcuts", () => {
    expect(getContextSection("notes", "editor", false).id).toBe("editor-view");
    expect(getContextSection("notes", "editor", true).id).toBe("editor-edit");
  });

  it("searches both displayed keys and translated descriptions", () => {
    const links = getSearchSections().find((section) => section.id === "links");
    const dailyLogs = links?.entries.find((entry) => entry.key === "3 / y");
    const translate = (key: string) =>
      key === I18N_KEYS.HELP_DESC_LINK_FILTER_MYDAY
        ? "Show links extracted from daily logs"
        : key;

    expect(dailyLogs).toBeDefined();
    expect(matchesHelpEntry(dailyLogs!, "daily", translate)).toBe(true);
    expect(matchesHelpEntry(dailyLogs!, "3 / y", translate)).toBe(true);
    expect(matchesHelpEntry(dailyLogs!, "missing", translate)).toBe(false);
  });

  it("hides AI shortcuts when AI is not configured", () => {
    const editor = getContextSection("notes", "editor", false, false);
    const sections = getSearchSections(false);

    expect(
      editor.entries.some(
        (entry) => entry.description === "HELP_DESC_EDITOR_AI",
      ),
    ).toBe(false);
    expect(
      sections.some((section) =>
        section.entries.some(
          (entry) => entry.description === "HELP_DESC_EDITOR_AI",
        ),
      ),
    ).toBe(false);
  });
});
