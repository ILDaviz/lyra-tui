import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runCli } from "../src/cli";
import { deleteNote } from "../src/services/notes-service";
import { EmbeddingService } from "../src/services/embedding";

describe("Headless CLI Dispatcher", () => {
  let logSpy: any;
  let errSpy: any;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("should return false when no arguments are provided (TUI mode)", async () => {
    const handled = await runCli([]);
    expect(handled).toBe(false);
  });

  it("should reject removed tui and gui commands", async () => {
    expect(await runCli(["tui"])).toBe(true);
    expect(await runCli(["gui"])).toBe(true);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("unknown command"),
    );
  });

  it("should handle version command", async () => {
    const handled = await runCli(["--version"]);
    expect(handled).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Lyra v"));
  });

  it("should report the release version without a tag prefix", async () => {
    vi.stubEnv("LYRA_VERSION", "v1.2.3");

    await runCli(["--version"]);

    expect(logSpy).toHaveBeenCalledWith("Lyra v1.2.3");
  });

  it("should handle general help command", async () => {
    const handled = await runCli(["--help"]);
    expect(handled).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Usage: lyra"));
  });

  it("should handle dedicated command-specific helpers", async () => {
    logSpy.mockClear();
    await runCli(["status", "--help"]);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Usage: lyra status"),
    );

    logSpy.mockClear();
    await runCli(["sync", "--help"]);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Usage: lyra sync"),
    );

    logSpy.mockClear();
    await runCli(["daemon", "--help"]);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Usage: lyra daemon"),
    );

    logSpy.mockClear();
    await runCli(["todo", "--help"]);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Usage: lyra todo"),
    );

    logSpy.mockClear();
    await runCli(["note", "--help"]);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Usage: lyra note"),
    );

    logSpy.mockClear();
    await runCli(["today", "--help"]);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Usage: lyra today"),
    );

    logSpy.mockClear();
    await runCli(["links", "--help"]);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Usage: lyra links"),
    );

    logSpy.mockClear();
    await runCli(["graph", "--help"]);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Usage: lyra graph"),
    );
  });

  it("should handle status command with --json", async () => {
    const handled = await runCli(["status", "--json"]);
    expect(handled).toBe(true);
    const jsonCall = logSpy.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].trim().startsWith("{"),
    )?.[0];
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall);
    expect(parsed.repoPath).toBeDefined();
    expect(parsed.stats).toBeDefined();
    expect(parsed.stats.todos).toBeDefined();
  });

  it("should handle status command text output", async () => {
    const handled = await runCli(["status"]);
    expect(handled).toBe(true);
    expect(logSpy).toHaveBeenCalled();
  });

  it("should handle todo add and list commands", async () => {
    await runCli([
      "todo",
      "add",
      "CLI Test Task 1",
      "--today",
      "--priority=high",
      "--due=2026-12-31",
    ]);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Task added to Today"),
    );

    logSpy.mockClear();
    await runCli(["todo", "list", "--json"]);
    const jsonCall = logSpy.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].trim().startsWith("["),
    )?.[0];
    expect(jsonCall).toBeDefined();
    const parsedTodos = JSON.parse(jsonCall);
    expect(Array.isArray(parsedTodos)).toBe(true);
    expect(
      parsedTodos.some((t: any) => t.text.includes("CLI Test Task 1")),
    ).toBe(true);

    logSpy.mockClear();
    await runCli(["todo", "list"]);
    expect(logSpy).toHaveBeenCalled();
  });

  it("does not index a task while running through the CLI", async () => {
    const indexNote = vi.spyOn(EmbeddingService.prototype, "indexNote");

    await runCli(["todo", "add", "CLI task without embeddings", "--today"]);

    expect(indexNote).not.toHaveBeenCalled();
    expect(process.env.LYRA_CLI_MODE).toBeUndefined();
    indexNote.mockRestore();
  });

  it("should handle note new, list and show commands", async () => {
    await runCli([
      "note",
      "new",
      "CLI Note Spec",
      "--content=# Spec Header\n\nSpec content.",
    ]);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Note created successfully"),
    );

    logSpy.mockClear();
    await runCli(["note", "list", "--json"]);
    const jsonCall = logSpy.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].trim().startsWith("["),
    )?.[0];
    expect(jsonCall).toBeDefined();
    const notes = JSON.parse(jsonCall);
    expect(Array.isArray(notes)).toBe(true);
    expect(notes.some((n: any) => n.filename === "cli-note-spec.md")).toBe(
      true,
    );

    logSpy.mockClear();
    await runCli(["note", "show", "cli-note-spec.md"]);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("# Spec Header"),
    );

    await deleteNote("/", "cli-note-spec.md");
  });

  it("should handle today show and append commands", async () => {
    await runCli(["today", "append", "- [ ] Log entry from automated test"]);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Added to Daily Log"),
    );

    logSpy.mockClear();
    await runCli(["today"]);
    const hasDailyLogOutput = logSpy.mock.calls.some(
      (c: any[]) =>
        typeof c[0] === "string" &&
        (c[0].includes("Daily Log") || c[0].includes("Log entry")),
    );
    expect(hasDailyLogOutput).toBe(true);
  });

  it("should handle links add and list commands", async () => {
    await runCli([
      "links",
      "add",
      "https://antigravity.google.com",
      "Antigravity Dev",
    ]);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Link saved to bookmarks"),
    );

    logSpy.mockClear();
    await runCli(["links", "list", "--json"]);
    const jsonCall = logSpy.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].trim().startsWith("["),
    )?.[0];
    expect(jsonCall).toBeDefined();
    const links = JSON.parse(jsonCall);
    expect(Array.isArray(links)).toBe(true);
    expect(
      links.some((l: any) => l.url.includes("antigravity.google.com")),
    ).toBe(true);
  });

  it("should handle sync command", async () => {
    const handled = await runCli(["sync"]);
    expect(handled).toBe(true);
  });

  it("should handle unknown command gracefully", async () => {
    const handled = await runCli(["non-existent-subcommand"]);
    expect(handled).toBe(true);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("unknown command"),
    );
  });

  it("should reject invalid CLI option values", async () => {
    await runCli(["todo", "list", "--status", "blocked"]);
    await runCli(["links", "list", "--filter", "external"]);
    await runCli(["graph", "nodes", "--sort", "random"]);

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid status"),
    );
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid link filter"),
    );
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid sort mode"),
    );
  });

  it("should disable ANSI sequences with --no-color", async () => {
    await runCli(["status", "--no-color"]);
    const output = logSpy.mock.calls
      .map((call: any[]) => String(call[0]))
      .join("\n");

    expect(output).not.toContain("\x1b[");
  });
});
