import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  parseFrontmatter,
  extractLinksAndTags,
  resolveObsidianLink,
  GraphService,
} from "../src/services/graph-service";
import { resetServices } from "../src/helpers";

describe("Obsidian Graph & Wikilink Service", () => {
  const testDir = path.join(os.homedir(), ".lyra_test_graph");

  beforeEach(async () => {
    process.env.LYRA_REPO_PATH = testDir;
    resetServices();
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    delete process.env.LYRA_REPO_PATH;
    resetServices();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe("parseFrontmatter", () => {
    it("should parse YAML frontmatter with aliases and tags correctly", () => {
      const content = `---
title: System Architecture
aliases:
  - Arch
  - Lyra Design
tags:
  - dev
  - terminal
---
# Actual Heading

Body text here`;

      const parsed = parseFrontmatter(content);
      expect(parsed.title).toBe("System Architecture");
      expect(parsed.aliases).toEqual(["Arch", "Lyra Design"]);
      expect(parsed.tags).toEqual(["dev", "terminal"]);
      expect(parsed.cleanContent).toContain("# Actual Heading");
    });

    it("should parse inline JSON-style aliases and tags array", () => {
      const content = `---
aliases: ["Simple Alias", "Another One"]
tags: ["tech", "ai"]
---
Content`;

      const parsed = parseFrontmatter(content);
      expect(parsed.aliases).toEqual(["Simple Alias", "Another One"]);
      expect(parsed.tags).toEqual(["tech", "ai"]);
    });

    it("should handle notes without frontmatter", () => {
      const content = "# Simple Note\n\nJust text";
      const parsed = parseFrontmatter(content);
      expect(parsed.aliases).toEqual([]);
      expect(parsed.tags).toEqual([]);
      expect(parsed.cleanContent).toBe(content);
    });
  });

  describe("extractLinksAndTags", () => {
    it("should extract Obsidian wikilinks with aliases and headings", () => {
      const content = `
See [[Architecture]] for details.
Check [[Architecture|Custom Label]] and [[Architecture#Database Section]].
Also [[Architecture#^block-123|Block Label]].
`;
      const { links } = extractLinksAndTags(content);
      expect(links.length).toBe(4);

      expect(links[0]).toMatchObject({
        target: "Architecture",
        alias: undefined,
        heading: undefined,
        isEmbed: false,
      });

      expect(links[1]).toMatchObject({
        target: "Architecture",
        alias: "Custom Label",
        heading: undefined,
        isEmbed: false,
      });

      expect(links[2]).toMatchObject({
        target: "Architecture",
        alias: undefined,
        heading: "Database Section",
        isEmbed: false,
      });

      expect(links[3]).toMatchObject({
        target: "Architecture",
        alias: "Block Label",
        heading: "^block-123",
        isEmbed: false,
      });
    });

    it("should extract embeds ![[...]] and standard markdown links", () => {
      const content = `
![[Embedded Note]]
![[Diagram.png]]
[Markdown Link](subfolder/another-note.md)
[Ignore Web](https://google.com)
`;
      const { links } = extractLinksAndTags(content);
      expect(links.length).toBe(3);

      expect(links[0]).toMatchObject({
        target: "Embedded Note",
        isEmbed: true,
        isMarkdown: false,
      });

      expect(links[1]).toMatchObject({
        target: "Diagram.png",
        isEmbed: true,
        isMarkdown: false,
      });

      expect(links[2]).toMatchObject({
        target: "subfolder/another-note.md",
        alias: "Markdown Link",
        isEmbed: false,
        isMarkdown: true,
      });
    });

    it("should extract inline tags while ignoring code blocks", () => {
      const content = `
This is a #note with #tag/nested and #dev.
\`\`\`
const x = #notATag;
\`\`\`
Inline \`#codeTag\` should be ignored.
`;
      const { inlineTags } = extractLinksAndTags(content);
      expect(inlineTags).toContain("note");
      expect(inlineTags).toContain("tag/nested");
      expect(inlineTags).toContain("dev");
      expect(inlineTags).not.toContain("notatag");
      expect(inlineTags).not.toContain("codetag");
    });
  });

  describe("resolveObsidianLink", () => {
    const fakeNotes = [
      {
        id: "index.md",
        filename: "index.md",
        folderName: "/",
        title: "Home",
        aliases: ["Dashboard", "Start"],
        tags: [],
        content: "",
        cleanContent: "",
      },
      {
        id: "projects/lyra.md",
        filename: "lyra.md",
        folderName: "projects",
        title: "Lyra TUI Project",
        aliases: ["Lyra"],
        tags: [],
        content: "",
        cleanContent: "",
      },
    ];

    it("should resolve by exact relative path", () => {
      const res = resolveObsidianLink("projects/lyra", "/", fakeNotes);
      expect(res.exists).toBe(true);
      expect(res.targetId).toBe("projects/lyra.md");
    });

    it("should resolve by filename across vault", () => {
      const res = resolveObsidianLink("lyra", "/", fakeNotes);
      expect(res.exists).toBe(true);
      expect(res.targetId).toBe("projects/lyra.md");
    });

    it("should resolve by frontmatter alias", () => {
      const res = resolveObsidianLink("Dashboard", "projects", fakeNotes);
      expect(res.exists).toBe(true);
      expect(res.targetId).toBe("index.md");
    });

    it("should resolve by note title", () => {
      const res = resolveObsidianLink("Lyra TUI Project", "/", fakeNotes);
      expect(res.exists).toBe(true);
      expect(res.targetId).toBe("projects/lyra.md");
    });

    it("should create unresolved phantom link if not found", () => {
      const res = resolveObsidianLink("Unknown Future Note", "/", fakeNotes);
      expect(res.exists).toBe(false);
      expect(res.targetId).toBe("unresolved:Unknown Future Note");
    });
  });

  describe("resolveObsidianLink index equivalence", () => {
    // Reference implementation matching the original Array.find-based logic.
    function legacyResolve(
      rawTarget: string,
      sourceFolder: string,
      allNotes: Array<{
        id: string;
        filename: string;
        folderName: string;
        title: string;
        aliases: string[];
      }>,
    ): { targetId: string; exists: boolean } {
      let cleanTarget = rawTarget.replace(/^\.\//, "").trim();
      if (cleanTarget.endsWith(".md")) {
        cleanTarget = cleanTarget.slice(0, -3);
      }
      const cleanTargetLower = cleanTarget.toLowerCase();
      const baseNameLower = path.basename(cleanTargetLower);

      const directRelPath = cleanTarget.endsWith(".md")
        ? cleanTarget
        : `${cleanTarget}.md`;
      const directMatch = allNotes.find(
        (n) => n.id.toLowerCase() === directRelPath.toLowerCase(),
      );
      if (directMatch) {
        return { targetId: directMatch.id, exists: true };
      }

      if (sourceFolder && sourceFolder !== "/" && sourceFolder !== "root") {
        const fromFolderRelPath = path
          .join(sourceFolder, directRelPath)
          .replace(/\\/g, "/");
        const folderRelMatch = allNotes.find(
          (n) => n.id.toLowerCase() === fromFolderRelPath.toLowerCase(),
        );
        if (folderRelMatch) {
          return { targetId: folderRelMatch.id, exists: true };
        }
      }

      const sameFolderMatch = allNotes.find(
        (n) =>
          n.folderName.toLowerCase() === sourceFolder.toLowerCase() &&
          n.filename.replace(/\.md$/, "").toLowerCase() === baseNameLower,
      );
      if (sameFolderMatch) {
        return { targetId: sameFolderMatch.id, exists: true };
      }

      const globalFilenameMatch = allNotes.find(
        (n) => n.filename.replace(/\.md$/, "").toLowerCase() === baseNameLower,
      );
      if (globalFilenameMatch) {
        return { targetId: globalFilenameMatch.id, exists: true };
      }

      const titleMatch = allNotes.find(
        (n) => n.title.toLowerCase() === cleanTargetLower,
      );
      if (titleMatch) {
        return { targetId: titleMatch.id, exists: true };
      }

      const aliasMatch = allNotes.find((n) =>
        n.aliases.some((a) => a.toLowerCase() === cleanTargetLower),
      );
      if (aliasMatch) {
        return { targetId: aliasMatch.id, exists: true };
      }

      return { targetId: `unresolved:${cleanTarget}`, exists: false };
    }

    const fixtureNotes = [
      {
        id: "index.md",
        filename: "index.md",
        folderName: "/",
        title: "Home",
        aliases: ["Dashboard", "Start"],
        tags: [] as string[],
      },
      {
        id: "projects/alpha.md",
        filename: "alpha.md",
        folderName: "projects",
        title: "Alpha Project",
        aliases: ["Alpha"],
        tags: [] as string[],
      },
      {
        id: "projects/beta.md",
        filename: "beta.md",
        folderName: "projects",
        title: "Beta",
        aliases: [],
        tags: [] as string[],
      },
      {
        id: "archive/beta.md",
        filename: "beta.md",
        folderName: "archive",
        title: "Old Beta",
        aliases: ["Beta"],
        tags: [] as string[],
      },
    ];

    const targets = [
      "index",
      "projects/alpha",
      "alpha",
      "beta",
      "archive/beta.md",
      "./beta",
      "Alpha",
      "Dashboard",
      "Old Beta",
      "missing note",
      "Lyra",
    ];
    const folders = ["/", "projects", "archive", "root"];

    it("resolves identically to the legacy find-based logic", () => {
      for (const target of targets) {
        for (const folder of folders) {
          const actual = resolveObsidianLink(target, folder, fixtureNotes);
          const expected = legacyResolve(target, folder, fixtureNotes);
          expect(actual.targetId).toBe(expected.targetId);
          expect(actual.exists).toBe(expected.exists);
        }
      }
    });
  });

  describe("Vault Graph Building & Backlinks", () => {
    it("should build full vault graph with existing and unresolved nodes", async () => {
      const projectsDir = path.join(testDir, "projects");
      await fs.mkdir(projectsDir, { recursive: true });

      await fs.writeFile(
        path.join(projectsDir, "alpha.md"),
        `---
aliases: ["Project Alpha"]
tags: ["featured"]
---
# Alpha Project

Links to [[Beta]] and [[Unresolved Idea]] and #roadmap.
`,
        "utf-8",
      );

      await fs.writeFile(
        path.join(testDir, "beta.md"),
        `# Beta Project

Links back to [[Project Alpha]].
`,
        "utf-8",
      );

      const graphService = new GraphService(testDir);
      const graph = await graphService.buildVaultGraph();

      expect(graph.nodes.length).toBe(3);

      const alphaNode = graph.nodes.find((n) => n.id === "projects/alpha.md");
      const betaNode = graph.nodes.find((n) => n.id === "beta.md");
      const unresolvedNode = graph.nodes.find(
        (n) => n.id === "unresolved:Unresolved Idea",
      );

      expect(alphaNode).toBeDefined();
      expect(alphaNode?.exists).toBe(true);
      expect(alphaNode?.aliases).toContain("Project Alpha");
      expect(alphaNode?.tags).toContain("featured");
      expect(alphaNode?.tags).toContain("roadmap");

      expect(betaNode).toBeDefined();
      expect(betaNode?.exists).toBe(true);

      expect(unresolvedNode).toBeDefined();
      expect(unresolvedNode?.exists).toBe(false);
      expect(unresolvedNode?.isUnresolved).toBe(true);

      expect(graph.edges.length).toBe(3);
      expect(graph.edges).toContainEqual(
        expect.objectContaining({
          source: "projects/alpha.md",
          target: "beta.md",
        }),
      );
      expect(graph.edges).toContainEqual(
        expect.objectContaining({
          source: "projects/alpha.md",
          target: "unresolved:Unresolved Idea",
        }),
      );
      expect(graph.edges).toContainEqual(
        expect.objectContaining({
          source: "beta.md",
          target: "projects/alpha.md",
        }),
      );

      const alphaBacklinks =
        await graphService.getBacklinks("projects/alpha.md");
      expect(alphaBacklinks.length).toBe(1);
      expect(alphaBacklinks[0].sourceId).toBe("beta.md");

      const local = await graphService.getLocalGraph("projects/alpha.md", 1);
      expect(local).not.toBeNull();
      expect(local?.node.id).toBe("projects/alpha.md");
      expect(local?.subgraphNodes.length).toBe(3);
      expect(local?.forwardLinks.map((n) => n.id)).toContain("beta.md");
      expect(local?.forwardLinks.map((n) => n.id)).toContain(
        "unresolved:Unresolved Idea",
      );
    });

    it("memoizes the graph until forced and picks up file changes", async () => {
      await fs.writeFile(path.join(testDir, "solo.md"), "# Solo\n", "utf-8");

      const graphService = new GraphService(testDir);
      const first = await graphService.buildVaultGraph();
      const memoized = await graphService.buildVaultGraph();
      expect(memoized).toBe(first);
      expect(first.nodes.find((n) => n.id === "solo.md")?.tags).not.toContain(
        "fresh",
      );

      await new Promise((r) => setTimeout(r, 20));
      await fs.writeFile(
        path.join(testDir, "solo.md"),
        "# Solo\n\nUpdated with #fresh tag and [[Ghost Note]] link.\n",
        "utf-8",
      );

      const rebuilt = await graphService.buildVaultGraph({ force: true });
      expect(rebuilt).not.toBe(first);

      const soloNode = rebuilt.nodes.find((n) => n.id === "solo.md");
      expect(soloNode?.tags).toContain("fresh");
      expect(
        rebuilt.edges.some(
          (e) => e.source === "solo.md" && e.target === "unresolved:Ghost Note",
        ),
      ).toBe(true);
    });
  });
});
