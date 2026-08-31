import { SyntaxStyle, RGBA } from "@opentui/core";
import type { Theme } from "../../theme";
import { getActiveTheme } from "../../theme";

export function detectFiletype(filename: string): string | null {
  if (!filename) return null;
  const lower = filename.toLowerCase();
  if (
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".txt")
  ) {
    return null;
  }
  const ext = lower.includes(".") ? lower.split(".").pop() || "" : "";
  const mapping: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    json: "json",
    sql: "sql",
    php: "php",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    css: "css",
    html: "html",
    htm: "html",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    java: "java",
    rb: "ruby",
    lua: "lua",
    zig: "zig",
  };
  return mapping[ext] || null;
}

export function createEditorSyntaxStyle(theme?: Theme): SyntaxStyle {
  const t = theme || getActiveTheme();
  const s = t.syntax;
  try {
    return SyntaxStyle.fromStyles({
      "markup.heading.1": { fg: RGBA.fromHex(s.h1), bold: true },
      "markup.heading.2": { fg: RGBA.fromHex(s.h2), bold: true },
      "markup.heading.3": { fg: RGBA.fromHex(s.h3), bold: true },
      "markup.heading.4": { fg: RGBA.fromHex(s.h4), bold: true },
      "markup.strong": { fg: RGBA.fromHex(s.bold), bold: true },
      "markup.bold": { fg: RGBA.fromHex(s.bold), bold: true },
      "markup.italic": { fg: RGBA.fromHex(s.italic), italic: true },
      "markup.raw": { fg: RGBA.fromHex(s.code) },
      "markup.list": { fg: RGBA.fromHex(s.list) },
      "markup.quote": { fg: RGBA.fromHex(s.quote), italic: true },
      "markup.link.url": { fg: RGBA.fromHex(s.link), underline: true },
      keyword: { fg: RGBA.fromHex(s.keyword), bold: true },
      "keyword.function": { fg: RGBA.fromHex(s.keyword), bold: true },
      "keyword.return": { fg: RGBA.fromHex(s.keyword), bold: true },
      "keyword.operator": { fg: RGBA.fromHex(s.keyword) },
      string: { fg: RGBA.fromHex(s.string) },
      "string.escape": { fg: RGBA.fromHex(s.keyword) },
      "string.special": { fg: RGBA.fromHex(s.stringSpecial) },
      comment: { fg: RGBA.fromHex(s.comment), italic: true },
      "comment.line": { fg: RGBA.fromHex(s.comment), italic: true },
      "comment.block": { fg: RGBA.fromHex(s.comment), italic: true },
      number: { fg: RGBA.fromHex(s.number) },
      constant: { fg: RGBA.fromHex(s.constant) },
      "constant.builtin": { fg: RGBA.fromHex(s.keyword) },
      function: { fg: RGBA.fromHex(s.function) },
      "function.call": { fg: RGBA.fromHex(s.function) },
      "function.builtin": { fg: RGBA.fromHex(s.function) },
      method: { fg: RGBA.fromHex(s.function) },
      type: { fg: RGBA.fromHex(s.type) },
      "type.builtin": { fg: RGBA.fromHex(s.keyword) },
      constructor: { fg: RGBA.fromHex(s.type) },
      operator: { fg: RGBA.fromHex(s.type) },
      punctuation: { fg: RGBA.fromHex(s.punctuation) },
      "punctuation.delimiter": { fg: RGBA.fromHex(s.punctuation) },
      "punctuation.bracket": { fg: RGBA.fromHex(s.punctuation) },
      variable: { fg: RGBA.fromHex(s.type) },
      "variable.builtin": { fg: RGBA.fromHex(s.keyword) },
      "variable.parameter": { fg: RGBA.fromHex(s.parameter) },
      property: { fg: RGBA.fromHex(s.constant) },
      tag: { fg: RGBA.fromHex(s.tag) },
      attribute: { fg: RGBA.fromHex(s.attribute) },
      heading: { fg: s.h2, bold: true },
      h1: { fg: s.h1, bold: true },
      h2: { fg: s.h2, bold: true },
      h3: { fg: s.h3, bold: true },
      h4: { fg: s.h4, bold: true },
      bold: { fg: s.bold, bold: true },
      italic: { fg: s.italic, italic: true },
      code: { fg: s.code, bg: s.codeBg },
      link: { fg: s.link, underline: true },
      list: { fg: s.list },
      quote: { fg: s.quote, italic: true },
      table: { fg: s.table },
      default: { fg: RGBA.fromHex(s.default) },
    });
  } catch (err) {
    console.error("Failed to create SyntaxStyle from theme styles:", err);
    try {
      return SyntaxStyle.create();
    } catch (createErr) {
      console.error("Failed to create default SyntaxStyle:", createErr);
      return {} as any;
    }
  }
}
