import { describe, it, expect } from "vitest";
import Fuse from "fuse.js";
import { filterWithFuse } from "../src/utils/fuzzy";

interface TodoLike {
  text: string;
  noteTitle: string;
  tags: string[];
  dueDate?: string;
}

const todos: TodoLike[] = [
  { text: "Fix login bug", noteTitle: "Backend", tags: ["auth"], dueDate: "2026-09-01" },
  { text: "Write docs", noteTitle: "Frontend", tags: ["docs"] },
  { text: "Refactor parser", noteTitle: "Core", tags: ["cleanup"], dueDate: "2026-08-15" },
];

function makeFuse(items: TodoLike[]): Fuse<TodoLike> {
  return new Fuse(items, {
    keys: ["text", "noteTitle", "tags", "dueDate"],
    threshold: 0.2,
    ignoreLocation: true,
  });
}

describe("filterWithFuse", () => {
  it("returns all items when query is empty", () => {
    expect(filterWithFuse(makeFuse(todos), todos, "")).toHaveLength(3);
    expect(filterWithFuse(makeFuse(todos), todos, "   ")).toHaveLength(3);
    expect(filterWithFuse(null, todos, "anything")).toHaveLength(3);
  });

  it("matches by text", () => {
    const result = filterWithFuse(makeFuse(todos), todos, "login");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Fix login bug");
  });

  it("matches by tag", () => {
    const result = filterWithFuse(makeFuse(todos), todos, "cleanup");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Refactor parser");
  });

  it("matches by note title", () => {
    const result = filterWithFuse(makeFuse(todos), todos, "frontend");
    expect(result).toHaveLength(1);
    expect(result[0].noteTitle).toBe("Frontend");
  });

  it("matches fuzzy (typos tolerated)", () => {
    const result = filterWithFuse(makeFuse(todos), todos, "docsn");
    expect(result.some((r) => r.text === "Write docs")).toBe(true);
  });

  it("returns nothing for unrelated queries", () => {
    expect(filterWithFuse(makeFuse(todos), todos, "zzzzzz")).toHaveLength(0);
  });

  it("trims surrounding whitespace in query", () => {
    const result = filterWithFuse(makeFuse(todos), todos, "  parser  ");
    expect(result).toHaveLength(1);
  });
});
