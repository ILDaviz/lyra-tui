import { describe, it, expect } from "vitest";
import {
  wrapTextWithTodo,
  wrapTextWithLink,
  wrapTextWithWikilink,
  buildAttachmentLink,
} from "../src/components/editor/useEditorShortcuts";

describe("Editor Shortcuts Text Formatting Helpers", () => {
  describe("wrapTextWithWikilink", () => {
    it("should wrap selected text in double brackets", () => {
      expect(wrapTextWithWikilink("My Note")).toBe("[[My Note]]");
      expect(wrapTextWithWikilink("Architecture")).toBe("[[Architecture]]");
    });
  });

  describe("wrapTextWithLink", () => {
    it("should wrap normal text into a markdown title link with https:// placeholder", () => {
      expect(wrapTextWithLink("Google")).toBe("[Google](https://)");
      expect(wrapTextWithLink("My Website")).toBe("[My Website](https://)");
    });

    it("should wrap URL text into a markdown link with Title placeholder", () => {
      expect(wrapTextWithLink("https://example.com")).toBe(
        "[Title](https://example.com)",
      );
      expect(wrapTextWithLink("http://test.org/path?q=1")).toBe(
        "[Title](http://test.org/path?q=1)",
      );
    });
  });

  describe("wrapTextWithTodo", () => {
    it("should prefix a single line text with - [ ]", () => {
      expect(wrapTextWithTodo("Buy groceries")).toBe("- [ ] Buy groceries");
    });

    it("should preserve indentation when prefixing todo checkbox", () => {
      expect(wrapTextWithTodo("  Subtask item")).toBe("  - [ ] Subtask item");
    });

    it("should convert bullet list items (- or * or +) into todo items", () => {
      expect(wrapTextWithTodo("- Bullet item")).toBe("- [ ] Bullet item");
      expect(wrapTextWithTodo("* Another bullet")).toBe("- [ ] Another bullet");
      expect(wrapTextWithTodo("+ Plus bullet")).toBe("- [ ] Plus bullet");
    });

    it("should keep existing todo checkboxes intact", () => {
      expect(wrapTextWithTodo("- [ ] Already a todo")).toBe(
        "- [ ] Already a todo",
      );
      expect(wrapTextWithTodo("- [x] Done item")).toBe("- [x] Done item");
      expect(wrapTextWithTodo("- [/] In progress")).toBe("- [/] In progress");
    });

    it("should format multiple lines correctly", () => {
      const input = "Task 1\nTask 2\n\nTask 3";
      const expected = "- [ ] Task 1\n- [ ] Task 2\n\n- [ ] Task 3";
      expect(wrapTextWithTodo(input)).toBe(expected);
    });
  });

  describe("buildAttachmentLink", () => {
    it("should build a vault-relative markdown attachment link", () => {
      expect(buildAttachmentLink("file.pdf", "attachments/file.pdf")).toBe(
        "[file.pdf](attachments/file.pdf)",
      );
      expect(
        buildAttachmentLink("my file.pdf", "attachments/my%20file.pdf"),
      ).toBe("[my file.pdf](attachments/my%20file.pdf)");
    });
  });
});
