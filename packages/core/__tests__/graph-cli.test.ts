import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { runCli } from "../src/cli";
import { resetServices } from "../src/helpers";

describe("Graph CLI Commands", () => {
  const testDir = path.join(os.homedir(), ".lyra_test_graph_cli");
  let logSpy: any;
  let errSpy: any;

  beforeEach(async () => {
    process.env.LYRA_REPO_PATH = testDir;
    resetServices();
    await fs.mkdir(testDir, { recursive: true });

    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const projectsDir = path.join(testDir, "projects");
    await fs.mkdir(projectsDir, { recursive: true });
    await fs.writeFile(
      path.join(projectsDir, "alpha.md"),
      `---
title: Alpha Architecture
aliases: ["Alpha Project", "Alpha"]
tags: ["core", "dev"]
---
# Alpha Architecture

Here is the design for Alpha. It connects to [[Beta Note]] and [[Missing Spec]] and ![[Diagram.png]].
#architecture
`,
      "utf-8",
    );

    await fs.writeFile(
      path.join(testDir, "beta.md"),
      `---
title: Beta Note
tags: ["dev"]
---
# Beta Note

Check the [[Alpha Architecture|Alpha]] specs.
Also [Standard Link](projects/alpha.md).
`,
      "utf-8",
    );

    await fs.writeFile(
      path.join(testDir, "orphan.md"),
      `---
title: Isolated Orphan
tags: ["misc"]
---
# Isolated Note without any links
`,
      "utf-8",
    );
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    delete process.env.LYRA_REPO_PATH;
    resetServices();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("should display graph stats in text format", async () => {
    const handled = await runCli(["graph"]);
    expect(handled).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Lyra Vault Knowledge Graph"),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Nodes:"));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Connections (Edges):"),
    );
  });

  it("should return graph stats in JSON format with --json", async () => {
    logSpy.mockClear();
    const handled = await runCli(["graph", "stats", "--json"]);
    expect(handled).toBe(true);

    const jsonCall = logSpy.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].trim().startsWith("{"),
    )?.[0];
    expect(jsonCall).toBeDefined();
    const stats = JSON.parse(jsonCall);

    expect(stats.totalNodes).toBeGreaterThanOrEqual(4);
    expect(stats.existingNotes).toBe(3);
    expect(stats.unresolvedCount).toBeGreaterThanOrEqual(1);
    expect(stats.orphanCount).toBe(1);
    expect(stats.edgeTypes.wikilink).toBeGreaterThanOrEqual(2);
    expect(
      stats.orphanNotes.some((o: any) => o.title === "Isolated Orphan"),
    ).toBe(true);
    expect(
      stats.unresolvedLinks.some((u: any) => u.title.includes("Missing Spec")),
    ).toBe(true);
  });

  it("should inspect a specific note with 'graph show'", async () => {
    logSpy.mockClear();
    const handled = await runCli([
      "graph",
      "show",
      "Alpha Architecture",
      "--depth=2",
    ]);
    expect(handled).toBe(true);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Lyra Graph Node:"),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Alpha Architecture"),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Forward Links"),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Backlinks (Incoming)"),
    );
  });

  it("should inspect a specific note with 'graph show --json'", async () => {
    logSpy.mockClear();
    const handled = await runCli([
      "graph",
      "show",
      "projects/alpha.md",
      "--json",
    ]);
    expect(handled).toBe(true);

    const jsonCall = logSpy.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].trim().startsWith("{"),
    )?.[0];
    expect(jsonCall).toBeDefined();
    const local = JSON.parse(jsonCall);

    expect(local.node.id).toBe("projects/alpha.md");
    expect(local.backlinks.length).toBeGreaterThanOrEqual(1);
    expect(local.forwardLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("should handle error when note is not found in 'graph show'", async () => {
    errSpy.mockClear();
    const handled = await runCli(["graph", "show", "NonExistentNoteXYZ"]);
    expect(handled).toBe(true);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("Note not found in graph"),
    );
  });

  it("should list graph nodes with 'graph nodes'", async () => {
    logSpy.mockClear();
    const handled = await runCli(["graph", "nodes"]);
    expect(handled).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Lyra Graph Nodes"),
    );
  });

  it("should filter nodes by unresolved, orphans, or tags", async () => {
    logSpy.mockClear();
    await runCli(["graph", "nodes", "--unresolved", "--json"]);
    let jsonCall = logSpy.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].trim().startsWith("["),
    )?.[0];
    expect(jsonCall).toBeDefined();
    let nodes = JSON.parse(jsonCall);
    expect(nodes.every((n: any) => n.isUnresolved || !n.exists)).toBe(true);

    logSpy.mockClear();
    await runCli(["graph", "nodes", "--orphans", "--json"]);
    jsonCall = logSpy.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].trim().startsWith("["),
    )?.[0];
    expect(jsonCall).toBeDefined();
    nodes = JSON.parse(jsonCall);
    expect(nodes.length).toBe(1);
    expect(nodes[0].title).toBe("Isolated Orphan");

    logSpy.mockClear();
    await runCli(["graph", "nodes", "--tag=misc", "--json"]);
    jsonCall = logSpy.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].trim().startsWith("["),
    )?.[0];
    expect(jsonCall).toBeDefined();
    nodes = JSON.parse(jsonCall);
    expect(nodes.length).toBe(1);
    expect(nodes[0].title).toBe("Isolated Orphan");
  });

  it("should list graph edges with 'graph edges'", async () => {
    logSpy.mockClear();
    const handled = await runCli(["graph", "edges"]);
    expect(handled).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Lyra Graph Edges & Connections"),
    );

    logSpy.mockClear();
    await runCli(["graph", "edges", "--json"]);
    const jsonCall = logSpy.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].trim().startsWith("["),
    )?.[0];
    expect(jsonCall).toBeDefined();
    const edges = JSON.parse(jsonCall);
    expect(Array.isArray(edges)).toBe(true);
    expect(edges.length).toBeGreaterThanOrEqual(3);
  });

  it("should show backlinks for a note with 'graph backlinks'", async () => {
    logSpy.mockClear();
    const handled = await runCli(["graph", "backlinks", "Alpha Architecture"]);
    expect(handled).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Backlinks to"),
    );

    logSpy.mockClear();
    await runCli(["graph", "backlinks", "alpha.md", "--json"]);
    const jsonCall = logSpy.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].trim().startsWith("{"),
    )?.[0];
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall);
    expect(parsed.backlinks.length).toBeGreaterThanOrEqual(1);
    expect(parsed.backlinks[0].sourceTitle).toBe("Beta Note");
  });

  it("should export graph in Mermaid format", async () => {
    logSpy.mockClear();
    const handled = await runCli(["graph", "export", "--format=mermaid"]);
    expect(handled).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("```mermaid"));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("flowchart TD"),
    );
  });

  it("should export graph in Graphviz DOT format", async () => {
    logSpy.mockClear();
    const handled = await runCli(["graph", "export", "--format=dot"]);
    expect(handled).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("digraph LyraVault"),
    );
  });

  it("should export graph to a file", async () => {
    const exportFile = path.join(testDir, "exported-graph.mermaid");
    logSpy.mockClear();
    const handled = await runCli(["graph", "export", exportFile]);
    expect(handled).toBe(true);

    const exists = await fs.stat(exportFile).catch(() => null);
    expect(exists).not.toBeNull();
    const fileContent = await fs.readFile(exportFile, "utf-8");
    expect(fileContent).toContain("```mermaid");
  });
});
