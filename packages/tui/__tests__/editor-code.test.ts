import { describe, it, expect } from "vitest";
import {
  detectFiletype,
  cleanMarkdownForDisplay,
} from "../src/components/editor";
import { getTreeSitterClient } from "@opentui/core";

describe("Editor Code Component Integration", () => {
  it("should detect code filetypes correctly from filenames", () => {
    expect(detectFiletype("index.ts")).toBe("typescript");
    expect(detectFiletype("component.tsx")).toBe("typescript");
    expect(detectFiletype("app.js")).toBe("javascript");
    expect(detectFiletype("module.jsx")).toBe("javascript");
    expect(detectFiletype("script.py")).toBe("python");
    expect(detectFiletype("main.rs")).toBe("rust");
    expect(detectFiletype("server.go")).toBe("go");
    expect(detectFiletype("deploy.sh")).toBe("bash");
    expect(detectFiletype("data.json")).toBe("json");
    expect(detectFiletype("queries.sql")).toBe("sql");
    expect(detectFiletype("index.php")).toBe("php");
    expect(detectFiletype("config.yaml")).toBe("yaml");
    expect(detectFiletype("settings.toml")).toBe("toml");
    expect(detectFiletype("style.css")).toBe("css");
    expect(detectFiletype("index.html")).toBe("html");
    expect(detectFiletype("native.zig")).toBe("zig");
  });

  it("should return null for markdown and plain text files", () => {
    expect(detectFiletype("notes.md")).toBeNull();
    expect(detectFiletype("README.markdown")).toBeNull();
    expect(detectFiletype("log.txt")).toBeNull();
    expect(detectFiletype("")).toBeNull();
    expect(detectFiletype("noextension")).toBeNull();
  });

  it("should clean markdown properly for display", () => {
    const raw = `# Title\n\n<svg width="100"><rect /></svg>\n\n<div data-type="lyra-todo" done="true">Done Task</div>\n<div data-type="lyra-todo">Pending Task</div>`;
    const cleaned = cleanMarkdownForDisplay(raw);
    expect(cleaned).toContain("🖼️ [SVG Graphic]");
    expect(cleaned).toContain("- [x] Done Task");
    expect(cleaned).toContain("- [ ] Pending Task");
    expect(cleaned).not.toContain("<svg");
    expect(cleaned).not.toContain("data-type=");
  });

  it("should provide access to TreeSitterClient instance", () => {
    const client = getTreeSitterClient();
    expect(client).toBeDefined();
    expect(typeof client.initialize).toBe("function");
    expect(typeof client.isInitialized).toBe("function");
  });
});
