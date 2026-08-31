import * as fs from "fs/promises";
import * as path from "path";
import { Command } from "commander";
import { getGraphService, findGraphNode } from "../../services/graph-service";
import { VaultGraph } from "../../types";
import { print, printError } from "../output";

const graphSortModes = new Set(["connections", "in", "out", "title"]);
const graphEdgeTypes = new Set(["wikilink", "embed", "markdown"]);

function parseGraphDepth(value: string | number | undefined): number {
  const depth = Number(value ?? 1);
  if (!Number.isSafeInteger(depth) || depth < 1 || depth > 2) {
    throw new Error("Graph depth must be 1 or 2.");
  }
  return depth;
}

function normalizeExportFormat(
  value?: string,
): "json" | "mermaid" | "dot" | undefined {
  if (!value) return undefined;
  switch (value.toLowerCase()) {
    case "json":
      return "json";
    case "mermaid":
    case "mmd":
      return "mermaid";
    case "dot":
    case "gv":
      return "dot";
    default:
      throw new Error(
        `Unsupported graph export format "${value}". Use json, mermaid, or dot.`,
      );
  }
}

export interface GraphStatsResult {
  totalNodes: number;
  existingNotes: number;
  unresolvedCount: number;
  orphanCount: number;
  totalEdges: number;
  edgeTypes: {
    wikilink: number;
    embed: number;
    markdown: number;
  };
  totalTags: number;
  averageConnections: number;
  topConnected: Array<{
    id: string;
    title: string;
    connections: number;
    inDegree: number;
    outDegree: number;
  }>;
  topBacklinks: Array<{ id: string; title: string; inDegree: number }>;
  unresolvedLinks: Array<{
    id: string;
    title: string;
    referencedByCount: number;
    sources: string[];
  }>;
  orphanNotes: Array<{
    id: string;
    title: string;
    filename: string;
    folder: string;
  }>;
}

export async function computeGraphStats(
  graph: VaultGraph,
): Promise<GraphStatsResult> {
  const totalNodes = graph.nodes.length;
  const existingNotes = graph.nodes.filter((n) => n.exists).length;
  const unresolvedNodes = graph.nodes.filter(
    (n) => n.isUnresolved || !n.exists,
  );
  const orphanNotes = graph.nodes.filter(
    (n) => n.exists && n.connectionsCount === 0,
  );

  const edgeTypes = {
    wikilink: graph.edges.filter((e) => e.type === "wikilink").length,
    embed: graph.edges.filter((e) => e.type === "embed").length,
    markdown: graph.edges.filter((e) => e.type === "markdown").length,
  };

  const totalTags = Object.keys(graph.tags).length;
  const avgConns = totalNodes > 0 ? (graph.edges.length * 2) / totalNodes : 0;

  const sortedByConns = [...graph.nodes]
    .filter((n) => n.exists)
    .sort((a, b) => b.connectionsCount - a.connectionsCount)
    .slice(0, 5)
    .map((n) => ({
      id: n.id,
      title: n.title,
      connections: n.connectionsCount,
      inDegree: n.inDegree,
      outDegree: n.outDegree,
    }));

  const sortedByInDegree = [...graph.nodes]
    .filter((n) => n.exists)
    .sort((a, b) => b.inDegree - a.inDegree)
    .slice(0, 5)
    .map((n) => ({
      id: n.id,
      title: n.title,
      inDegree: n.inDegree,
    }));

  const unresolvedLinks = unresolvedNodes.map((n) => {
    const incomingSources = (graph.adjacency[n.id]?.incoming || []).map(
      (srcId) => {
        const srcNode = graph.nodes.find((node) => node.id === srcId);
        return srcNode ? srcNode.title : srcId;
      },
    );
    return {
      id: n.id,
      title: n.title,
      referencedByCount: n.inDegree,
      sources: incomingSources,
    };
  });

  return {
    totalNodes,
    existingNotes,
    unresolvedCount: unresolvedNodes.length,
    orphanCount: orphanNotes.length,
    totalEdges: graph.edges.length,
    edgeTypes,
    totalTags,
    averageConnections: Number(avgConns.toFixed(2)),
    topConnected: sortedByConns,
    topBacklinks: sortedByInDegree,
    unresolvedLinks,
    orphanNotes: orphanNotes.map((n) => ({
      id: n.id,
      title: n.title,
      filename: n.filename,
      folder: n.folderName || "/",
    })),
  };
}

export async function graphStatsAction(
  options: { json?: boolean } = {},
): Promise<void> {
  const graphService = getGraphService();
  const graph = await graphService.buildVaultGraph();
  const stats = await computeGraphStats(graph);

  if (options.json) {
    print(JSON.stringify(stats, null, 2));
    return;
  }

  print("\n  \x1b[1;35m✦ Lyra Vault Knowledge Graph\x1b[0m\n");
  print(
    `  \x1b[1mNodes:\x1b[0m               ${stats.totalNodes} total (\x1b[32m${stats.existingNotes} notes\x1b[0m, \x1b[33m${stats.unresolvedCount} unresolved phantom links\x1b[0m)`,
  );
  print(
    `  \x1b[1mConnections (Edges):\x1b[0m ${stats.totalEdges} (\x1b[36m${stats.edgeTypes.wikilink} wikilinks\x1b[0m, \x1b[35m${stats.edgeTypes.embed} embeds\x1b[0m, \x1b[90m${stats.edgeTypes.markdown} markdown\x1b[0m)`,
  );
  print(`  \x1b[1mIndexed Tags:\x1b[0m        ${stats.totalTags} tags`);
  print(
    `  \x1b[1mAvg Connectivity:\x1b[0m    ${stats.averageConnections} links / node\n`,
  );

  if (stats.topConnected.length > 0) {
    print("  \x1b[1;33m★ Hub Notes (Most Connected):\x1b[0m");
    stats.topConnected.forEach((item, idx) => {
      print(
        `     ${idx + 1}. \x1b[1m${item.title}\x1b[0m \x1b[90m(${item.id})\x1b[0m: \x1b[32m${item.connections} links\x1b[0m \x1b[90m(⮌ ${item.inDegree} in · ➔ ${item.outDegree} out)\x1b[0m`,
      );
    });
    print("");
  }

  if (stats.unresolvedLinks.length > 0) {
    print(
      `  \x1b[1;33m⚠️  Unresolved Links (${stats.unresolvedLinks.length}):\x1b[0m`,
    );
    stats.unresolvedLinks.slice(0, 8).forEach((item) => {
      const srcList =
        item.sources.length > 0
          ? ` \x1b[90m(from: ${item.sources.join(", ")})\x1b[0m`
          : "";
      print(`     • \x1b[33m[[${item.title}]]\x1b[0m${srcList}`);
    });
    if (stats.unresolvedLinks.length > 8) {
      print(
        `     \x1b[90m... and ${stats.unresolvedLinks.length - 8} more\x1b[0m`,
      );
    }
    print("");
  }

  if (stats.orphanNotes.length > 0) {
    print(
      `  \x1b[1;90m🏝  Orphan Notes (${stats.orphanNotes.length} notes with 0 links):\x1b[0m`,
    );
    stats.orphanNotes.slice(0, 8).forEach((item) => {
      print(`     • \x1b[1m${item.title}\x1b[0m \x1b[90m(${item.id})\x1b[0m`);
    });
    if (stats.orphanNotes.length > 8) {
      print(`     \x1b[90m... and ${stats.orphanNotes.length - 8} more\x1b[0m`);
    }
    print("");
  }
}

export async function graphShowAction(
  noteQuery: string,
  options: { depth?: string | number; json?: boolean } = {},
): Promise<void> {
  if (!noteQuery || noteQuery.trim().length === 0) {
    printError(
      "\x1b[31mError:\x1b[0m Specify note path or title, e.g. 'lyra graph show Architecture'",
    );
    process.exitCode = 1;
    return;
  }

  const graphService = getGraphService();
  const graph = await graphService.buildVaultGraph();
  const node = findGraphNode(graph, noteQuery);

  if (!node) {
    printError(`\x1b[31mError:\x1b[0m Note not found in graph: "${noteQuery}"`);
    process.exitCode = 1;
    return;
  }

  const depth = parseGraphDepth(options.depth);
  const localGraph = await graphService.getLocalGraph(node.id, depth);

  if (options.json) {
    print(JSON.stringify(localGraph, null, 2));
    return;
  }

  print(`\n  \x1b[1;35m✦ Lyra Graph Node:\x1b[0m \x1b[1m${node.title}\x1b[0m`);
  print(
    `  \x1b[1mID / Path:\x1b[0m       ${node.id} ${node.exists ? "\x1b[32m(Exists)\x1b[0m" : "\x1b[33m(⚠️ Unresolved)\x1b[0m"}`,
  );
  if (node.aliases.length > 0) {
    print(`  \x1b[1mAliases:\x1b[0m         ${node.aliases.join(", ")}`);
  }
  if (node.tags.length > 0) {
    print(
      `  \x1b[1mTags:\x1b[0m            ${node.tags.map((t) => `#${t}`).join(" ")}`,
    );
  }
  print(
    `  \x1b[1mConnections:\x1b[0m     ${node.connectionsCount} total (\x1b[32m⮌ ${node.inDegree} backlinks\x1b[0m, \x1b[36m➔ ${node.outDegree} forward links\x1b[0m)\n`,
  );

  const forwardEdges = graph.edges.filter((e) => e.source === node.id);
  print(`  \x1b[1;36m┌─ Forward Links (${forwardEdges.length})\x1b[0m`);
  if (forwardEdges.length === 0) {
    print("  \x1b[90m│  (No outgoing links in this note)\x1b[0m");
  } else {
    forwardEdges.forEach((edge, idx) => {
      const isLast = idx === forwardEdges.length - 1;
      const prefix = isLast ? "  └── " : "  ├── ";
      const targetNode = graph.nodes.find((n) => n.id === edge.target);
      const targetTitle = targetNode ? targetNode.title : edge.rawTarget;
      const unresBadge =
        targetNode && !targetNode.exists
          ? " \x1b[33m(⚠️ Unresolved)\x1b[0m"
          : "";
      const typeBadge = `\x1b[90m[${edge.type}]\x1b[0m`;
      const aliasInfo = edge.alias ? ` \x1b[90mas "${edge.alias}"\x1b[0m` : "";
      const headingInfo = edge.heading
        ? ` \x1b[90m#${edge.heading}\x1b[0m`
        : "";

      print(
        `${prefix}➔ \x1b[1m[[${targetTitle}]]\x1b[0m ${typeBadge}${aliasInfo}${headingInfo}${unresBadge}`,
      );
    });
  }
  print("");

  const backlinks = localGraph?.backlinks || [];
  print(`  \x1b[1;32m┌─ Backlinks (Incoming) (${backlinks.length})\x1b[0m`);
  if (backlinks.length === 0) {
    print("  \x1b[90m│  (No other notes link to this note)\x1b[0m");
  } else {
    backlinks.forEach((bl, idx) => {
      const isLast = idx === backlinks.length - 1;
      const prefix = isLast ? "  └── " : "  ├── ";
      const lineSnippet = bl.lineSnippet
        ? `\n  ${isLast ? "   " : "│  "}  \x1b[90m"${bl.lineSnippet}"\x1b[0m`
        : "";
      print(
        `${prefix}⮌ \x1b[1m${bl.sourceTitle}\x1b[0m \x1b[90m(${bl.sourceId})\x1b[0m${lineSnippet}`,
      );
    });
  }
  print("");

  if (localGraph && localGraph.subgraphNodes.length > 1) {
    print(`  \x1b[1;35m┌─ Local Neighborhood Subgraph (Depth ${depth})\x1b[0m`);
    print(`  │  \x1b[1;4m[[${node.title}]]\x1b[0m \x1b[90m(center)\x1b[0m`);

    const adj = graph.adjacency[node.id] || { outgoing: [], incoming: [] };
    const directNeighbors = Array.from(
      new Set([...adj.outgoing, ...adj.incoming]),
    );

    directNeighbors.forEach((nbrId, idx) => {
      const isLastNbr = idx === directNeighbors.length - 1;
      const nbrNode = graph.nodes.find((n) => n.id === nbrId);
      if (!nbrNode) return;

      const isOutgoing = adj.outgoing.includes(nbrId);
      const isIncoming = adj.incoming.includes(nbrId);
      const arrow = isOutgoing && isIncoming ? "⮂" : isOutgoing ? "➔" : "⮌";
      const unres = !nbrNode.exists ? " \x1b[33m(⚠️)\x1b[0m" : "";

      print(
        `  ${isLastNbr ? "└──" : "├──"} ${arrow} \x1b[1m[[${nbrNode.title}]]\x1b[0m${unres}`,
      );

      if (depth >= 2) {
        const hop2Adj = graph.adjacency[nbrId] || {
          outgoing: [],
          incoming: [],
        };
        const hop2Neighbors = Array.from(
          new Set([...hop2Adj.outgoing, ...hop2Adj.incoming]),
        ).filter((h2) => h2 !== node.id && h2 !== nbrId);

        hop2Neighbors.slice(0, 4).forEach((h2Id, h2Idx) => {
          const isLastHop2 = h2Idx === Math.min(hop2Neighbors.length, 4) - 1;
          const h2Node = graph.nodes.find((n) => n.id === h2Id);
          if (!h2Node) return;
          const subPrefix = isLastNbr ? "    " : "│   ";
          print(
            `  ${subPrefix}${isLastHop2 ? "└──" : "├──"} \x1b[90m[[${h2Node.title}]]\x1b[0m`,
          );
        });
        if (hop2Neighbors.length > 4) {
          const subPrefix = isLastNbr ? "    " : "│   ";
          print(
            `  ${subPrefix}└── \x1b[90m... and ${hop2Neighbors.length - 4} more\x1b[0m`,
          );
        }
      }
    });
    print("");
  }
}

export async function graphNodesAction(
  options: {
    unresolved?: boolean;
    missing?: boolean;
    orphans?: boolean;
    tag?: string;
    sort?: string;
    json?: boolean;
  } = {},
): Promise<void> {
  const graphService = getGraphService();
  const graph = await graphService.buildVaultGraph();

  let filtered = graph.nodes;

  if (options.unresolved || options.missing) {
    filtered = filtered.filter((n) => n.isUnresolved || !n.exists);
  } else if (options.orphans) {
    filtered = filtered.filter((n) => n.exists && n.connectionsCount === 0);
  }

  if (options.tag) {
    const cleanTag = options.tag.toLowerCase().replace(/^#/, "").trim();
    filtered = filtered.filter((n) =>
      n.tags.some((t) => t.toLowerCase() === cleanTag),
    );
  }

  const sortMode = options.sort || "connections";
  if (sortMode === "in") {
    filtered.sort((a, b) => b.inDegree - a.inDegree);
  } else if (sortMode === "out") {
    filtered.sort((a, b) => b.outDegree - a.outDegree);
  } else if (sortMode === "title") {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    filtered.sort(
      (a, b) =>
        b.connectionsCount - a.connectionsCount ||
        a.title.localeCompare(b.title),
    );
  }

  if (options.json) {
    print(JSON.stringify(filtered, null, 2));
    return;
  }

  print("\n  \x1b[1;35m✦ Lyra Graph Nodes\x1b[0m\n");

  if (filtered.length === 0) {
    print("  \x1b[90mNo nodes matching filter found.\x1b[0m\n");
    return;
  }

  filtered.forEach((n, idx) => {
    const badge = !n.exists
      ? "\x1b[33m[Unresolved]\x1b[0m"
      : n.connectionsCount === 0
        ? "\x1b[90m[ Orphan  ]\x1b[0m"
        : "\x1b[32m[   Note   ]\x1b[0m";

    const tagsStr =
      n.tags.length > 0
        ? ` \x1b[36m${n.tags.map((t) => `#${t}`).join(" ")}\x1b[0m`
        : "";
    const connsStr = `\x1b[90m(${n.connectionsCount} conns · ⮌ ${n.inDegree} in · ➔ ${n.outDegree} out)\x1b[0m`;

    print(
      `  ${String(idx + 1).padStart(2, " ")}. ${badge} \x1b[1m${n.title}\x1b[0m \x1b[90m[${n.id}]\x1b[0m ${connsStr}${tagsStr}`,
    );
  });

  print(`\n  \x1b[90mTotal: ${filtered.length} nodes\x1b[0m\n`);
}

export async function graphEdgesAction(
  options: {
    source?: string;
    target?: string;
    type?: string;
    json?: boolean;
  } = {},
): Promise<void> {
  const graphService = getGraphService();
  const graph = await graphService.buildVaultGraph();

  let filtered = graph.edges;

  if (options.source) {
    const cleanSrc = options.source.toLowerCase();
    filtered = filtered.filter((e) =>
      e.source.toLowerCase().includes(cleanSrc),
    );
  }

  if (options.target) {
    const cleanTgt = options.target.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.target.toLowerCase().includes(cleanTgt) ||
        e.rawTarget.toLowerCase().includes(cleanTgt),
    );
  }

  if (options.type) {
    const cleanType = options.type.toLowerCase();
    filtered = filtered.filter((e) => e.type.toLowerCase() === cleanType);
  }

  if (options.json) {
    print(JSON.stringify(filtered, null, 2));
    return;
  }

  print("\n  \x1b[1;35m✦ Lyra Graph Edges & Connections\x1b[0m\n");

  if (filtered.length === 0) {
    print("  \x1b[90mNo edges found matching filter.\x1b[0m\n");
    return;
  }

  filtered.forEach((edge, idx) => {
    const typeColor =
      edge.type === "embed"
        ? "\x1b[35m"
        : edge.type === "wikilink"
          ? "\x1b[36m"
          : "\x1b[90m";
    const typeLabel = `${typeColor}──[${edge.type}]──➔\x1b[0m`;
    const aliasInfo = edge.alias ? ` \x1b[90mas "${edge.alias}"\x1b[0m` : "";
    const headingInfo = edge.heading ? ` \x1b[90m#${edge.heading}\x1b[0m` : "";

    print(
      `  ${String(idx + 1).padStart(3, " ")}. \x1b[1m${edge.source}\x1b[0m ${typeLabel} \x1b[1m${edge.target}\x1b[0m${aliasInfo}${headingInfo}`,
    );
  });

  print(`\n  \x1b[90mTotal: ${filtered.length} connections\x1b[0m\n`);
}

export async function graphBacklinksAction(
  noteQuery: string,
  options: { json?: boolean } = {},
): Promise<void> {
  if (!noteQuery || noteQuery.trim().length === 0) {
    printError(
      "\x1b[31mError:\x1b[0m Specify note path or title, e.g. 'lyra graph backlinks Architecture'",
    );
    process.exitCode = 1;
    return;
  }

  const graphService = getGraphService();
  const graph = await graphService.buildVaultGraph();
  const node = findGraphNode(graph, noteQuery);

  if (!node) {
    printError(`\x1b[31mError:\x1b[0m Note not found: "${noteQuery}"`);
    process.exitCode = 1;
    return;
  }

  const backlinks = await graphService.getBacklinks(node.id);

  if (options.json) {
    print(JSON.stringify({ note: node, backlinks }, null, 2));
    return;
  }

  print(
    `\n  \x1b[1;35m✦ Backlinks to\x1b[0m \x1b[1m"${node.title}"\x1b[0m \x1b[90m(${node.id})\x1b[0m\n`,
  );

  if (backlinks.length === 0) {
    print("  \x1b[90mNo incoming backlinks found for this note.\x1b[0m\n");
    return;
  }

  backlinks.forEach((bl, idx) => {
    const aliasInfo = bl.alias ? ` \x1b[90m(as "${bl.alias}")\x1b[0m` : "";
    const headingInfo = bl.heading ? ` \x1b[90m#${bl.heading}\x1b[0m` : "";
    print(
      `  ${String(idx + 1).padStart(2, " ")}. \x1b[1m${bl.sourceTitle}\x1b[0m \x1b[90m(from ${bl.sourceId})\x1b[0m${aliasInfo}${headingInfo}`,
    );
    if (bl.lineSnippet) {
      print(`      \x1b[90m"${bl.lineSnippet}"\x1b[0m`);
    }
  });

  print(`\n  \x1b[90mTotal: ${backlinks.length} backlinks\x1b[0m\n`);
}

export function generateMermaidGraph(
  graph: VaultGraph,
  title = "Lyra Vault Graph",
): string {
  const sanitizeId = (id: string) => `n_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const lines: string[] = ["```mermaid", "flowchart TD", `  %% ${title}`];

  for (const node of graph.nodes) {
    const sId = sanitizeId(node.id);
    const cleanTitle = node.title.replace(/"/g, '\\"');
    if (!node.exists) {
      lines.push(`  ${sId}["❓ ${cleanTitle}"]:::unresolved`);
    } else {
      lines.push(`  ${sId}["${cleanTitle}"]`);
    }
  }

  for (const edge of graph.edges) {
    const srcId = sanitizeId(edge.source);
    const tgtId = sanitizeId(edge.target);
    const edgeLabel = edge.type !== "wikilink" ? `|${edge.type}|` : "";
    lines.push(`  ${srcId} -->${edgeLabel} ${tgtId}`);
  }

  lines.push(
    "  classDef unresolved fill:#fef3c7,stroke:#f59e0b,stroke-dasharray: 5 5;",
  );
  lines.push("```");
  return lines.join("\n");
}

export function generateDotGraph(graph: VaultGraph): string {
  const sanitizeId = (id: string) => `"${id.replace(/"/g, '\\"')}"`;
  const lines: string[] = [
    "digraph LyraVault {",
    "  rankdir=LR;",
    '  node [shape=box, style="rounded,filled", fillcolor="#f0f4f8", fontname="sans-serif"];',
    '  edge [color="#64748b", fontname="sans-serif", fontsize=10];',
  ];

  for (const node of graph.nodes) {
    const nId = sanitizeId(node.id);
    const label = node.title.replace(/"/g, '\\"');
    if (!node.exists) {
      lines.push(
        `  ${nId} [label="${label}", fillcolor="#fef3c7", style="rounded,dashed,filled", color="#f59e0b"];`,
      );
    } else {
      lines.push(`  ${nId} [label="${label}"];`);
    }
  }

  for (const edge of graph.edges) {
    const srcId = sanitizeId(edge.source);
    const tgtId = sanitizeId(edge.target);
    const label = edge.type !== "wikilink" ? ` [label="${edge.type}"]` : "";
    lines.push(`  ${srcId} -> ${tgtId}${label};`);
  }

  lines.push("}");
  return lines.join("\n");
}

export async function graphExportAction(
  outputPath?: string,
  options: { format?: string; note?: string; depth?: string | number } = {},
): Promise<void> {
  const graphService = getGraphService();
  let graph = await graphService.buildVaultGraph();

  if (options.note) {
    const targetNode = findGraphNode(graph, options.note);
    if (!targetNode) {
      printError(`\x1b[31mError:\x1b[0m Note not found: "${options.note}"`);
      process.exitCode = 1;
      return;
    }
    const depth = parseGraphDepth(options.depth);
    const local = await graphService.getLocalGraph(targetNode.id, depth);
    if (local) {
      graph = {
        nodes: local.subgraphNodes,
        edges: local.subgraphEdges,
        adjacency: {},
        tags: {},
      };
    }
  }

  const format =
    normalizeExportFormat(options.format) ||
    normalizeExportFormat(
      outputPath ? path.extname(outputPath).slice(1) : undefined,
    ) ||
    "json";
  let content: string;

  if (format === "mermaid") {
    content = generateMermaidGraph(
      graph,
      options.note ? `Subgraph: ${options.note}` : "Lyra Vault Graph",
    );
  } else if (format === "dot") {
    content = generateDotGraph(graph);
  } else {
    content = JSON.stringify(graph, null, 2);
  }

  if (outputPath) {
    await fs.writeFile(outputPath, content, "utf-8");
    print(
      `\n  \x1b[32m✔ Graph exported successfully to:\x1b[0m ${outputPath} (${format})\n`,
    );
  } else {
    print(content);
  }
}

export function registerGraphCommand(program: Command): void {
  const graphCmd = program
    .command("graph")
    .alias("graphs")
    .description(
      "Analyze, inspect, and export the vault knowledge graph and wikilinks",
    )
    .action(async () => {
      await graphStatsAction();
    });

  graphCmd
    .command("stats", { isDefault: true })
    .description(
      "Display comprehensive knowledge graph metrics, hub notes, and orphans",
    )
    .option("-j, --json", "Output graph statistics in JSON format")
    .action(async (options) => {
      await graphStatsAction(options);
    });

  graphCmd
    .command("show <note...>")
    .aliases(["inspect", "local"])
    .description(
      "Inspect connections, forward links, backlinks, and neighborhood for a note",
    )
    .option("-d, --depth <depth>", "Neighborhood traversal depth (1 or 2)", "1")
    .option("-j, --json", "Output note subgraph in JSON format")
    .action(async (noteParts, options) => {
      parseGraphDepth(options.depth);
      const query = Array.isArray(noteParts) ? noteParts.join(" ") : noteParts;
      await graphShowAction(query, options);
    });

  graphCmd
    .command("nodes")
    .alias("list")
    .description(
      "List graph nodes with connectivity, tags, and unresolved filters",
    )
    .option("--unresolved", "Show only unresolved phantom links")
    .option("--missing", "Alias for --unresolved")
    .option("--orphans", "Show only orphan notes with 0 connections")
    .option("-t, --tag <tag>", "Filter notes by tag")
    .option(
      "-s, --sort <sort>",
      "Sort order: connections|in|out|title",
      "connections",
    )
    .option("-j, --json", "Output nodes list in JSON format")
    .action(async (options) => {
      if (options.unresolved && options.orphans) {
        throw new Error("Use either --unresolved or --orphans, not both.");
      }
      if (!graphSortModes.has(options.sort.toLowerCase())) {
        throw new Error(
          `Invalid sort mode "${options.sort}". Use connections, in, out, or title.`,
        );
      }
      options.sort = options.sort.toLowerCase();
      await graphNodesAction(options);
    });

  graphCmd
    .command("edges")
    .alias("links")
    .description("List graph edges (connections) between notes")
    .option("--source <source>", "Filter by source note")
    .option("--target <target>", "Filter by target note")
    .option("--type <type>", "Filter by edge type (wikilink|embed|markdown)")
    .option("-j, --json", "Output edges list in JSON format")
    .action(async (options) => {
      if (options.type && !graphEdgeTypes.has(options.type.toLowerCase())) {
        throw new Error(
          `Invalid edge type "${options.type}". Use wikilink, embed, or markdown.`,
        );
      }
      if (options.type) options.type = options.type.toLowerCase();
      await graphEdgesAction(options);
    });

  graphCmd
    .command("backlinks <note...>")
    .description("List all incoming backlinks and context snippets for a note")
    .option("-j, --json", "Output backlinks in JSON format")
    .action(async (noteParts, options) => {
      const query = Array.isArray(noteParts) ? noteParts.join(" ") : noteParts;
      await graphBacklinksAction(query, options);
    });

  graphCmd
    .command("export [file]")
    .description(
      "Export knowledge graph to JSON, Mermaid flowchart, or Graphviz DOT",
    )
    .option(
      "-f, --format <format>",
      "Export format: json|mermaid|dot (inferred from file extension)",
    )
    .option(
      "-n, --note <note>",
      "Export only the local subgraph around a specific note",
    )
    .option(
      "-d, --depth <depth>",
      "Neighborhood depth for note subgraph export",
      "1",
    )
    .action(async (file, options) => {
      parseGraphDepth(options.depth);
      await graphExportAction(file, options);
    });
}
