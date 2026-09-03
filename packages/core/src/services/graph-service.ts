import * as fs from "fs/promises";
import * as path from "path";
import {
  getRepoPath,
  getMyDayPath,
  ensureDirs,
  resolveFolderPath,
  getRelativePath,
  captureException,
} from "../helpers";
import {
  GraphNode,
  GraphEdge,
  VaultGraph,
  BacklinkContext,
  LocalGraphResult,
} from "../types";
import { cachedFileScan, pruneScanKind, flushScanCache } from "./scan-cache";
import { listVaultFiles } from "./vault-scan";

export interface ParsedFrontmatter {
  title?: string;
  aliases: string[];
  tags: string[];
  cleanContent: string;
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const aliases: string[] = [];
  const tags: string[] = [];
  let title: string | undefined;

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmMatch) {
    return { aliases, tags, cleanContent: content };
  }

  const fmBody = fmMatch[1];
  const cleanContent = content.slice(fmMatch[0].length);

  const lines = fmBody.split(/\r?\n/);
  let currentKey = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const listMatch = line.match(/^\s*-\s+(.+)$/);
    if (listMatch) {
      let val = listMatch[1].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (currentKey === "aliases" || currentKey === "alias") {
        aliases.push(val);
      } else if (currentKey === "tags" || currentKey === "tag") {
        tags.push(val.replace(/^#/, "").toLowerCase());
      }
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      let rawVal = line.slice(colonIdx + 1).trim();
      currentKey = key;

      if (
        (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
        (rawVal.startsWith("'") && rawVal.endsWith("'"))
      ) {
        rawVal = rawVal.slice(1, -1);
      }

      if (key === "title" && rawVal) {
        title = rawVal;
      } else if ((key === "aliases" || key === "alias") && rawVal) {
        if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
          try {
            const arr = JSON.parse(rawVal);
            if (Array.isArray(arr)) {
              aliases.push(...arr.map((a) => String(a).trim()));
            }
          } catch {
            const items = rawVal
              .slice(1, -1)
              .split(",")
              .map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
            aliases.push(...items.filter(Boolean));
          }
        } else {
          const items = rawVal
            .split(",")
            .map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
          aliases.push(...items.filter(Boolean));
        }
      } else if ((key === "tags" || key === "tag") && rawVal) {
        if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
          try {
            const arr = JSON.parse(rawVal);
            if (Array.isArray(arr)) {
              tags.push(
                ...arr.map((t) =>
                  String(t).replace(/^#/, "").trim().toLowerCase(),
                ),
              );
            }
          } catch {
            const items = rawVal
              .slice(1, -1)
              .split(",")
              .map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
            tags.push(
              ...items
                .map((t) => t.replace(/^#/, "").toLowerCase())
                .filter(Boolean),
            );
          }
        } else {
          const items = rawVal
            .split(",")
            .map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
          tags.push(
            ...items
              .map((t) => t.replace(/^#/, "").toLowerCase())
              .filter(Boolean),
          );
        }
      }
    }
  }

  return { title, aliases, tags, cleanContent };
}

export interface ExtractedLink {
  raw: string;
  target: string;
  alias?: string;
  heading?: string;
  isEmbed: boolean;
  isMarkdown: boolean;
  lineSnippet?: string;
}

export function extractLinksAndTags(content: string): {
  links: ExtractedLink[];
  inlineTags: string[];
} {
  const links: ExtractedLink[] = [];
  const inlineTags: string[] = [];

  const codeBlockRegex = /```[\s\S]*?```|`[^`\n]+`/g;
  const sanitizedContent = content.replace(codeBlockRegex, (match) =>
    " ".repeat(match.length),
  );

  const lines = sanitizedContent.split(/\r?\n/);
  const rawLines = content.split(/\r?\n/);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const rawLine = rawLines[lineIdx] || "";

    const wikilinkRegex = /(!)?\[\[(.*?)\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = wikilinkRegex.exec(line)) !== null) {
      const isEmbed = Boolean(match[1]);
      const inner = match[2].trim();
      if (!inner) continue;

      let targetPart = inner;
      let alias: string | undefined;
      let heading: string | undefined;

      const pipeIdx = targetPart.indexOf("|");
      if (pipeIdx !== -1) {
        alias = targetPart.slice(pipeIdx + 1).trim();
        targetPart = targetPart.slice(0, pipeIdx).trim();
      }

      const hashIdx = targetPart.indexOf("#");
      if (hashIdx !== -1) {
        heading = targetPart.slice(hashIdx + 1).trim();
        targetPart = targetPart.slice(0, hashIdx).trim();
      }

      if (targetPart) {
        if (
          targetPart === "attachments" ||
          targetPart.startsWith("attachments/") ||
          targetPart.startsWith("./attachments/")
        ) {
          continue;
        }
        links.push({
          raw: match[0],
          target: targetPart,
          alias,
          heading,
          isEmbed,
          isMarkdown: false,
          lineSnippet: rawLine.trim().slice(0, 150),
        });
      }
    }

    const mdLinkRegex = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
    while ((match = mdLinkRegex.exec(line)) !== null) {
      const label = match[1].trim();
      const href = match[2].trim();

      if (
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        href.startsWith("#") ||
        href.startsWith("lyra-file://") ||
        href === "attachments" ||
        href.startsWith("attachments/") ||
        href.startsWith("./attachments/")
      ) {
        continue;
      }

      let targetPath = href;
      let heading: string | undefined;
      const hashIdx = targetPath.indexOf("#");
      if (hashIdx !== -1) {
        heading = targetPath.slice(hashIdx + 1).trim();
        targetPath = targetPath.slice(0, hashIdx).trim();
      }

      if (targetPath) {
        links.push({
          raw: match[0],
          target: targetPath,
          alias: label,
          heading,
          isEmbed: false,
          isMarkdown: true,
          lineSnippet: rawLine.trim().slice(0, 150),
        });
      }
    }

    const tagRegex = /(?:^|\s)#([a-zA-Z0-9_\-/]+)(?=\s|$|[.,;:!?])/g;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(line)) !== null) {
      const tag = tagMatch[1].toLowerCase();
      if (
        !/^\d+$/.test(tag) &&
        !/^[0-9a-fA-F]{3,6}$/.test(tag) &&
        !inlineTags.includes(tag)
      ) {
        inlineTags.push(tag);
      }
    }
  }

  return { links, inlineTags };
}

interface RawNoteData {
  id: string;
  filename: string;
  folderName: string;
  title: string;
  aliases: string[];
  tags: string[];
  content?: string;
  cleanContent?: string;
}

interface NoteLinkIndex {
  byId: Map<string, RawNoteData>;
  byFolderBase: Map<string, RawNoteData>;
  byBase: Map<string, RawNoteData>;
  byTitle: Map<string, RawNoteData>;
  byAlias: Map<string, RawNoteData>;
}

function buildNoteIndex(allNotes: RawNoteData[]): NoteLinkIndex {
  const index: NoteLinkIndex = {
    byId: new Map(),
    byFolderBase: new Map(),
    byBase: new Map(),
    byTitle: new Map(),
    byAlias: new Map(),
  };

  for (const note of allNotes) {
    const idLower = note.id.toLowerCase();
    if (!index.byId.has(idLower)) index.byId.set(idLower, note);

    const baseLower = note.filename.replace(/\.md$/, "").toLowerCase();
    const folderKey = `${note.folderName.toLowerCase()}\u0000${baseLower}`;
    if (!index.byFolderBase.has(folderKey)) {
      index.byFolderBase.set(folderKey, note);
    }
    if (!index.byBase.has(baseLower)) index.byBase.set(baseLower, note);

    const titleLower = note.title.toLowerCase();
    if (!index.byTitle.has(titleLower)) index.byTitle.set(titleLower, note);

    for (const alias of note.aliases) {
      const aliasLower = alias.toLowerCase();
      if (!index.byAlias.has(aliasLower)) index.byAlias.set(aliasLower, note);
    }
  }

  return index;
}

function resolveWithIndex(
  rawTarget: string,
  sourceFolder: string,
  index: NoteLinkIndex,
): { targetId: string; exists: boolean; resolvedNote?: RawNoteData } {
  let cleanTarget = rawTarget.replace(/^\.\//, "").trim();
  if (cleanTarget.endsWith(".md")) {
    cleanTarget = cleanTarget.slice(0, -3);
  }
  const cleanTargetLower = cleanTarget.toLowerCase();
  const baseNameLower = path.basename(cleanTargetLower);

  const directRelPath = cleanTarget.endsWith(".md")
    ? cleanTarget
    : `${cleanTarget}.md`;
  const directMatch = index.byId.get(directRelPath.toLowerCase());
  if (directMatch) {
    return {
      targetId: directMatch.id,
      exists: true,
      resolvedNote: directMatch,
    };
  }

  if (sourceFolder && sourceFolder !== "/" && sourceFolder !== "root") {
    const fromFolderRelPath = path
      .join(sourceFolder, directRelPath)
      .replace(/\\/g, "/");
    const folderRelMatch = index.byId.get(fromFolderRelPath.toLowerCase());
    if (folderRelMatch) {
      return {
        targetId: folderRelMatch.id,
        exists: true,
        resolvedNote: folderRelMatch,
      };
    }
  }

  const sameFolderMatch = index.byFolderBase.get(
    `${sourceFolder.toLowerCase()}\u0000${baseNameLower}`,
  );
  if (sameFolderMatch) {
    return {
      targetId: sameFolderMatch.id,
      exists: true,
      resolvedNote: sameFolderMatch,
    };
  }

  const globalFilenameMatch = index.byBase.get(baseNameLower);
  if (globalFilenameMatch) {
    return {
      targetId: globalFilenameMatch.id,
      exists: true,
      resolvedNote: globalFilenameMatch,
    };
  }

  const titleMatch = index.byTitle.get(cleanTargetLower);
  if (titleMatch) {
    return { targetId: titleMatch.id, exists: true, resolvedNote: titleMatch };
  }

  const aliasMatch = index.byAlias.get(cleanTargetLower);
  if (aliasMatch) {
    return { targetId: aliasMatch.id, exists: true, resolvedNote: aliasMatch };
  }

  const unresolvedId = `unresolved:${cleanTarget}`;
  return { targetId: unresolvedId, exists: false };
}

export function resolveObsidianLink(
  rawTarget: string,
  sourceFolder: string,
  allNotes: RawNoteData[],
): { targetId: string; exists: boolean; resolvedNote?: RawNoteData } {
  return resolveWithIndex(rawTarget, sourceFolder, buildNoteIndex(allNotes));
}

const GRAPH_SCAN_KIND = "graph";

interface CachedNoteGraphData {
  title: string;
  aliases: string[];
  fmTags: string[];
  links: ExtractedLink[];
  inlineTags: string[];
}

async function parseNoteGraphData(
  filePath: string,
  filename: string,
): Promise<CachedNoteGraphData> {
  const content = await fs.readFile(filePath, "utf-8");
  const fm = parseFrontmatter(content);

  let title = fm.title || filename.replace(/\.md$/, "");
  if (!fm.title) {
    const titleMatch = fm.cleanContent.match(/^#\s+(.+)$/m);
    if (titleMatch && titleMatch[1].trim()) {
      title = titleMatch[1].trim();
    }
  }

  const { links, inlineTags } = extractLinksAndTags(fm.cleanContent);

  return { title, aliases: fm.aliases, fmTags: fm.tags, links, inlineTags };
}

export class GraphService {
  private repoPath: string;
  private cachedGraph: VaultGraph | null = null;

  constructor(repoPath?: string) {
    this.repoPath = repoPath || getRepoPath();
  }

  invalidateGraph(): void {
    this.cachedGraph = null;
  }

  async buildVaultGraph(options?: { force?: boolean }): Promise<VaultGraph> {
    if (!options?.force && this.cachedGraph) {
      return this.cachedGraph;
    }
    await ensureDirs();
    const myDayPath = getMyDayPath();

    const { folderFiles, myDayFiles, seenPaths } = await listVaultFiles();

    interface GraphScanEntry {
      folder: string;
      filename: string;
      note: RawNoteData;
      data: CachedNoteGraphData;
    }

    const items: { folder: string; filename: string; filePath: string }[] = [];
    for (const [folder, files] of folderFiles) {
      const folderPath = resolveFolderPath(folder);
      for (const filename of files) {
        items.push({
          folder,
          filename,
          filePath: path.join(folderPath, filename),
        });
      }
    }
    for (const filename of myDayFiles) {
      items.push({
        folder: "myday",
        filename,
        filePath: path.join(myDayPath, filename),
      });
    }

    const scanned = await Promise.all(
      items.map(
        async ({
          folder,
          filename,
          filePath,
        }): Promise<GraphScanEntry | null> => {
          try {
            const stat = await fs.stat(filePath);
            const data = await cachedFileScan<CachedNoteGraphData>(
              GRAPH_SCAN_KIND,
              filePath,
              stat,
              () => parseNoteGraphData(filePath, filename),
            );
            const note: RawNoteData = {
              id: getRelativePath(folder, filename),
              filename,
              folderName: folder,
              title: data.title,
              aliases: data.aliases,
              tags: data.fmTags,
            };
            return { folder, filename, note, data };
          } catch (err) {
            if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
              console.error(`Error reading note ${filePath} for graph:`, err);
              captureException(err);
            }
            return null;
          }
        },
      ),
    );

    const entries = scanned.filter((e): e is GraphScanEntry => e !== null);
    const rawNotes = entries.map((e) => e.note);

    await pruneScanKind(GRAPH_SCAN_KIND, seenPaths);
    await flushScanCache();

    const noteIndex = buildNoteIndex(rawNotes);

    const nodesMap = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const edgeKeys = new Set<string>();
    const adjacency: Record<
      string,
      { outgoing: string[]; incoming: string[] }
    > = {};
    const tagIndex: Record<string, string[]> = {};

    for (const { note, data } of entries) {
      const allTags = Array.from(new Set([...data.fmTags, ...data.inlineTags]));

      nodesMap.set(note.id, {
        id: note.id,
        filename: note.filename,
        folderName: note.folderName,
        title: note.title,
        aliases: note.aliases,
        tags: allTags,
        exists: true,
        isUnresolved: false,
        connectionsCount: 0,
        inDegree: 0,
        outDegree: 0,
      });

      adjacency[note.id] = { outgoing: [], incoming: [] };

      for (const tag of allTags) {
        if (!tagIndex[tag]) tagIndex[tag] = [];
        if (!tagIndex[tag].includes(note.id)) {
          tagIndex[tag].push(note.id);
        }
      }
    }

    for (const { note, data } of entries) {
      const sourceId = note.id;

      for (const link of data.links) {
        const resolution = resolveWithIndex(
          link.target,
          note.folderName,
          noteIndex,
        );
        const targetId = resolution.targetId;

        if (!resolution.exists && !nodesMap.has(targetId)) {
          const rawName = link.target.replace(/\.md$/, "");
          nodesMap.set(targetId, {
            id: targetId,
            filename: `${path.basename(rawName)}.md`,
            folderName: "",
            title: rawName,
            aliases: [],
            tags: [],
            exists: false,
            isUnresolved: true,
            connectionsCount: 0,
            inDegree: 0,
            outDegree: 0,
          });
          adjacency[targetId] = { outgoing: [], incoming: [] };
        }

        const edgeType = link.isEmbed
          ? "embed"
          : link.isMarkdown
            ? "markdown"
            : "wikilink";

        const edgeKey = `${sourceId}->${targetId}:${edgeType}:${link.heading || ""}`;
        if (!edgeKeys.has(edgeKey)) {
          edgeKeys.add(edgeKey);
          edges.push({
            source: sourceId,
            target: targetId,
            type: edgeType,
            rawTarget: link.target,
            alias: link.alias,
            heading: link.heading,
            lineSnippet: link.lineSnippet,
          });

          const sourceAdj = adjacency[sourceId];
          if (sourceAdj && !sourceAdj.outgoing.includes(targetId)) {
            sourceAdj.outgoing.push(targetId);
          }
          const targetAdj = adjacency[targetId];
          if (targetAdj && !targetAdj.incoming.includes(sourceId)) {
            targetAdj.incoming.push(sourceId);
          }
        }
      }
    }

    for (const node of nodesMap.values()) {
      const adj = adjacency[node.id] || { outgoing: [], incoming: [] };
      node.outDegree = adj.outgoing.length;
      node.inDegree = adj.incoming.length;
      node.connectionsCount = node.outDegree + node.inDegree;
    }

    const graph: VaultGraph = {
      nodes: Array.from(nodesMap.values()),
      edges,
      adjacency,
      tags: tagIndex,
    };

    this.cachedGraph = graph;
    return graph;
  }

  async getBacklinks(noteId: string): Promise<BacklinkContext[]> {
    const graph = await this.buildVaultGraph();
    const adj = graph.adjacency[noteId];
    if (!adj || adj.incoming.length === 0) return [];

    const backlinks: BacklinkContext[] = [];
    for (const sourceId of adj.incoming) {
      const sourceNode = graph.nodes.find((n) => n.id === sourceId);
      if (!sourceNode) continue;

      const edge = graph.edges.find(
        (e) => e.source === sourceId && e.target === noteId,
      );

      backlinks.push({
        sourceId: sourceNode.id,
        sourceTitle: sourceNode.title,
        sourceFilename: sourceNode.filename,
        sourceFolder: sourceNode.folderName,
        lineSnippet: edge?.lineSnippet,
        alias: edge?.alias,
        heading: edge?.heading,
      });
    }

    return backlinks;
  }

  async findNode(query: string): Promise<GraphNode | undefined> {
    const graph = await this.buildVaultGraph();
    return findGraphNode(graph, query);
  }

  async getLocalGraph(
    noteId: string,
    depth = 1,
  ): Promise<LocalGraphResult | null> {
    const graph = await this.buildVaultGraph();
    const centerNode = graph.nodes.find((n) => n.id === noteId);
    if (!centerNode) return null;

    const visitedNodeIds = new Set<string>([noteId]);
    let frontier = new Set<string>([noteId]);

    for (let d = 0; d < depth; d++) {
      const nextFrontier = new Set<string>();
      for (const currId of frontier) {
        const adj = graph.adjacency[currId];
        if (adj) {
          for (const neighborId of [...adj.outgoing, ...adj.incoming]) {
            if (!visitedNodeIds.has(neighborId)) {
              visitedNodeIds.add(neighborId);
              nextFrontier.add(neighborId);
            }
          }
        }
      }
      frontier = nextFrontier;
    }

    const subgraphNodes = graph.nodes.filter((n) => visitedNodeIds.has(n.id));
    const subgraphEdges = graph.edges.filter(
      (e) => visitedNodeIds.has(e.source) && visitedNodeIds.has(e.target),
    );

    const backlinks = await this.getBacklinks(noteId);
    const forwardLinks = (graph.adjacency[noteId]?.outgoing || [])
      .map((id) => graph.nodes.find((n) => n.id === id))
      .filter((n): n is GraphNode => Boolean(n));

    return {
      node: centerNode,
      backlinks,
      forwardLinks,
      subgraphNodes,
      subgraphEdges,
    };
  }
}

let graphServiceInstance: GraphService | null = null;

export function getGraphService(): GraphService {
  if (!graphServiceInstance) {
    graphServiceInstance = new GraphService();
  }
  return graphServiceInstance;
}

export function findGraphNode(
  graph: VaultGraph,
  query: string,
): GraphNode | undefined {
  if (!query) return undefined;
  const clean = query.trim();
  const cleanLower = clean.toLowerCase();
  const cleanNoMd = cleanLower.replace(/\.md$/, "");
  const baseName = path.basename(cleanNoMd);

  let match = graph.nodes.find((n) => n.id.toLowerCase() === cleanLower);
  if (match) return match;

  match = graph.nodes.find(
    (n) =>
      n.id.toLowerCase() === `${cleanLower}.md` ||
      n.id.toLowerCase().replace(/\.md$/, "") === cleanNoMd,
  );
  if (match) return match;

  match = graph.nodes.find(
    (n) =>
      n.filename.toLowerCase() === cleanLower ||
      n.filename.toLowerCase().replace(/\.md$/, "") === baseName,
  );
  if (match) return match;

  match = graph.nodes.find((n) => n.title.toLowerCase() === cleanLower);
  if (match) return match;

  match = graph.nodes.find((n) =>
    n.aliases.some((a) => a.toLowerCase() === cleanLower),
  );
  if (match) return match;

  match = graph.nodes.find(
    (n) =>
      n.title.toLowerCase().includes(cleanLower) ||
      n.id.toLowerCase().includes(cleanLower),
  );
  if (match) return match;

  return undefined;
}
