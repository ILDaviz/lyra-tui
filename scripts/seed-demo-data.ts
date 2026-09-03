import * as fs from "fs/promises";
import * as path from "path";

// Pseudo-Random Number Generator (Mulberry32)
function createPRNG(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createPRNG(42);

function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randSample<T>(arr: readonly T[], count: number): T[] {
  const result: T[] = [];
  const copied = [...arr];
  const n = Math.min(count, copied.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * copied.length);
    result.push(copied[idx]);
    copied.splice(idx, 1);
  }
  return result;
}

function pickRandom<T>(arr: readonly T[], count: number): T[] {
  const n = arr.length;
  const c = Math.min(count, n);
  if (c === 0) return [];
  const seen = new Set<number>();
  while (seen.size < c) {
    seen.add(Math.floor(rng() * n));
  }
  const result: T[] = [];
  for (const idx of seen) result.push(arr[idx]);
  return result;
}

const AI_DOMAINS = [
  "Transformer Architecture",
  "RAG Pipeline",
  "Vector Search Index",
  "LoRA Fine-Tuning",
  "Triton Kernel",
  "CUDA Memory Allocator",
  "vLLM Engine",
  "Quantization AWQ",
  "Embedding Distillation",
  "Attention Mechanism",
  "FlashAttention v2",
  "TensorRT Optimization",
  "LLM Agent Orchestrator",
  "Prompt Engineering Evaluation",
  "Mixture of Experts",
  "KV Cache Management",
  "Speculative Decoding",
  "Context Window Extension",
  "Cross-Encoder Reranker",
  "Semantic Cache",
  "Synthetic Data Pipeline",
  "Safety Alignment DPO",
  "Tokenization BPE",
  "Embedding Clustering",
];

const ARCH_DOMAINS = [
  "Distributed Consensus",
  "Raft State Machine",
  "Event Sourcing Store",
  "CQRS Query Engine",
  "Database Sharding Router",
  "Distributed Transaction Saga",
  "API Gateway Proxy",
  "Rate Limiting Algorithm",
  "Cache Invalidation Strategy",
  "Circuit Breaker Pattern",
  "Outbox Pattern Publisher",
  "Service Mesh Topology",
  "Global Multi-Region Sync",
  "Zero-Copy IPC Buffer",
  "Consistent Hashing Ring",
  "Idempotency Key Manager",
  "Read-Through Cache",
  "Columnar Storage Index",
  "LSM Tree Compaction",
  "Partition Pruning Engine",
];

const INFRA_DOMAINS = [
  "Kubernetes Custom Controller",
  "Helm Release Orchestration",
  "Terraform Provider State",
  "ArgoCD GitOps Pipeline",
  "eBPF Network Observability",
  "Prometheus Metrics Scraper",
  "Grafana Dashboard Generator",
  "KEDA Autoscaler Rule",
  "Linux Kernel TCP Tuning",
  "Ceph Block Storage Pool",
  "Cilium CNI Router",
  "Envoy Filter Chain",
  "CoreDNS Resolution Policy",
  "Vector Log Collector",
  "OpenTelemetry Trace Exporter",
  "Jaeger Distributed Tracing",
  "Harbor Container Registry",
  "Vault Secret Lease Manager",
  "WireGuard Mesh Tunnel",
  "BGP Peering Gateway",
];

const BACKEND_DOMAINS = [
  "Tokio Async Runtime",
  "Rust Memory Allocator",
  "Go Concurrency Pool",
  "PostgreSQL Index Optimizer",
  "Postgres Connection Pooler",
  "Redis Cluster Shard",
  "Kafka Partition Consumer",
  "NATS JetStream Stream",
  "gRPC Protocol Buffer",
  "GraphQL Schema Federation",
  "gRPC Streaming Pipeline",
  "HTTP3 QUIC Connection",
  "Deadlock Detection System",
  "WAL Archive Streamer",
  "Zero-Copy JSON Parser",
  "Distributed Lock Lease",
  "SSE Notification Gateway",
  "WebSocket PubSub Hub",
  "SIMD Vectorized Parser",
  "DuckDB Analytical Worker",
];

const SECURITY_DOMAINS = [
  "Zero Trust Architecture",
  "OAuth2 PKCE Flow",
  "OIDC Token Validator",
  "mTLS Certificate Authority",
  "KMS Key Rotation Worker",
  "SAST Security Gate",
  "DAST Penetration Suite",
  "RBAC Permission Matrix",
  "ABAC Policy Engine",
  "SOC2 Compliance Audit",
  "GDPR Data Redaction",
  "Incident Response Playbook",
  "Secret Detection Scanner",
  "Vulnerability CVE Watcher",
  "Hardware Security Module",
  "Audit Log Cryptographic Chain",
];

const LEARNING_DOMAINS = [
  "Formal Verification TLA+",
  "Compiler Optimization Passes",
  "WebAssembly Memory Sandbox",
  "Custom JIT Compiler",
  "LSM vs B-Tree Benchmarks",
  "Lock-Free Ring Buffer",
  "CRDT State-Based Sync",
  "Distributed Snapshot Algorithm",
  "Vectorized Execution Engine",
  "Cache-Conscious Data Structure",
  "Branch Predictor Tuning",
  "Memory Ordering Barriers",
];

const ROOT_DOMAINS = [
  "Engineering Roadmap",
  "System Architecture Blueprint",
  "Service Catalog Index",
  "Developer Dashboard",
  "Sprint Planning Log",
  "Engineering Quality Standards",
  "Quarterly Retrospective",
  "Cross-Team API Contracts",
  "Incident Postmortem Archive",
  "Tech Debt Triage Index",
  "Observability Strategy Guide",
  "Platform Reliability Goals",
  "Design Review Guidelines",
  "Tooling Evaluation Framework",
  "Capacity Planning Model",
  "Engineering Growth Matrix",
];

const FOLDERS = [
  { name: "AI-Engineering", domains: AI_DOMAINS, prefix: "AI" },
  { name: "Architecture", domains: ARCH_DOMAINS, prefix: "ARCH" },
  { name: "Infrastructure-DevOps", domains: INFRA_DOMAINS, prefix: "INFRA" },
  { name: "Backend-Systems", domains: BACKEND_DOMAINS, prefix: "BACK" },
  { name: "Security-Compliance", domains: SECURITY_DOMAINS, prefix: "SEC" },
  { name: "Learning-and-Research", domains: LEARNING_DOMAINS, prefix: "RES" },
];

const ROOT_NOTE_COUNT = 2_000;
const NOTES_PER_FOLDER = 1_200;
const TOTAL_LINKS = 8_000;
const CHUNK_SIZE = 500;
const FOLDER_KEYS = ["", ...FOLDERS.map((f) => f.name)];

const URL_DOMAINS = [
  "https://github.com",
  "https://docs.rs",
  "https://huggingface.co",
  "https://arxiv.org",
  "https://cloud.google.com/docs",
  "https://aws.amazon.com/blogs",
  "https://kubernetes.io/docs",
  "https://opentelemetry.io/docs",
  "https://prometheus.io/docs",
  "https://grafana.com/docs",
  "https://postgresql.org/docs",
  "https://redis.io/docs",
  "https://sqlite.org/docs.html",
  "https://kafka.apache.org/documentation",
  "https://nats.io/docs",
  "https://typescriptlang.org/docs",
  "https://bun.sh/docs",
  "https://rust-lang.org/learn",
  "https://go.dev/doc",
  "https://developer.mozilla.org/en-US/docs",
  "https://rfc-editor.org/rfc",
  "https://martinfowler.com/articles",
  "https://12factor.net",
  "https://pytorch.org/docs",
  "https://triton-lang.org/main",
  "https://vllm.ai/docs",
];

const TECH_TAGS = [
  "ai",
  "llm",
  "rag",
  "vector-search",
  "cuda",
  "vllm",
  "quantization",
  "embedding",
  "architecture",
  "distributed-systems",
  "raft",
  "cqrs",
  "event-sourcing",
  "consensus",
  "infra",
  "kubernetes",
  "helm",
  "terraform",
  "ebpf",
  "observability",
  "prometheus",
  "backend",
  "rust",
  "go",
  "typescript",
  "postgres",
  "redis",
  "kafka",
  "grpc",
  "graphql",
  "security",
  "zero-trust",
  "oauth2",
  "kms",
  "soc2",
  "audit",
  "compliance",
  "learning",
  "paper",
  "research",
  "tla+",
  "compiler",
  "algorithms",
  "performance",
];

interface GeneratedNoteMeta {
  folder: string; // "" Use for root.
  filename: string;
  title: string;
  tags: string[];
  aliases: string[];
}

async function main() {
  const rootTarget = path.join(process.cwd(), "lyra_dev");
  console.log(`[Seed] Target directory: ${rootTarget}`);

  await fs.rm(rootTarget, { recursive: true, force: true });
  await fs.mkdir(rootTarget, { recursive: true });
  await fs.mkdir(path.join(rootTarget, "myday"), { recursive: true });
  await fs.mkdir(path.join(rootTarget, ".lyra"), { recursive: true });

  for (const f of FOLDERS) {
    await fs.mkdir(path.join(rootTarget, f.name), { recursive: true });
  }

  console.log(
    `[Seed] Generating metadata for ${ROOT_NOTE_COUNT + NOTES_PER_FOLDER * FOLDERS.length} notes...`,
  );
  const allNotes: GeneratedNoteMeta[] = [];

  // Root notes
  for (let i = 1; i <= ROOT_NOTE_COUNT; i++) {
    const domain = randChoice(ROOT_DOMAINS);
    const slug = `${domain.replace(/\s+/g, "-")}-${i}`;
    const title = `${domain}: System Specification ${i}`;
    const tags = randSample(TECH_TAGS, randInt(2, 4));
    allNotes.push({
      folder: "",
      filename: `${slug}.md`,
      title,
      tags,
      aliases: [slug, `Root Spec ${i}`],
    });
  }

  // Folder notes
  for (const folder of FOLDERS) {
    for (let i = 1; i <= NOTES_PER_FOLDER; i++) {
      const domain = randChoice(folder.domains);
      const slug = `${folder.prefix}-${domain.replace(/\s+/g, "-")}-${i}`;
      const title = `${domain} Reference & Design Doc ${i}`;
      const tags = Array.from(
        new Set([
          folder.name.toLowerCase().split("-")[0],
          ...randSample(TECH_TAGS, randInt(2, 4)),
        ]),
      );
      allNotes.push({
        folder: folder.name,
        filename: `${slug}.md`,
        title,
        tags,
        aliases: [slug, `${folder.prefix} Memo ${i}`],
      });
    }
  }

  console.log(`[Seed] Total notes to write: ${allNotes.length}`);

  console.log("[Seed] Generating content and cross-link graph for notes...");
  const notesByFolder = new Map<string, GeneratedNoteMeta[]>();
  for (const n of allNotes) {
    const arr = notesByFolder.get(n.folder);
    if (arr) arr.push(n);
    else notesByFolder.set(n.folder, [n]);
  }

  let notesWritten = 0;
  let pending: { filePath: string; content: string }[] = [];
  const flushNotes = async () => {
    await Promise.all(
      pending.map((f) => fs.writeFile(f.filePath, f.content, "utf-8")),
    );
    notesWritten += pending.length;
    pending = [];
    process.stdout.write(
      `\r[Seed] Written ${notesWritten} / ${allNotes.length} notes`,
    );
  };

  for (let i = 0; i < allNotes.length; i++) {
    const note = allNotes[i];
    const wikilinkTargets: GeneratedNoteMeta[] = [];
    const sameCategoryNotes = notesByFolder.get(note.folder) ?? [];
    wikilinkTargets.push(
      ...pickRandom(sameCategoryNotes, randInt(2, 5)).filter(
        (n) => n.filename !== note.filename,
      ),
    );
    const otherFolders = FOLDER_KEYS.filter((k) => k !== note.folder);
    wikilinkTargets.push(
      ...randSample(otherFolders, randInt(2, 4)).map((fk) => {
        const arr = notesByFolder.get(fk)!;
        return arr[Math.floor(rng() * arr.length)];
      }),
    );

    const wikilinkLines = wikilinkTargets
      .map((target, idx) => {
        const targetRef = target.folder
          ? `${target.folder}/${target.filename.replace(/\.md$/, "")}`
          : target.filename.replace(/\.md$/, "");
        const formatType = idx % 4;
        if (formatType === 0)
          return `- Architecture relationship: [[${targetRef}]]`;
        if (formatType === 1)
          return `- Cross-referenced specification: [[${targetRef}|${target.title}]]`;
        if (formatType === 2)
          return `- Detailed analysis in section: [[${targetRef}#Implementation Details]]`;
        return `![[${targetRef}]]`;
      })
      .join("\n");

    const extUrl1 = `${randChoice(URL_DOMAINS)}/spec-${(i % 100) + 1}`;
    const extUrl2 = `${randChoice(URL_DOMAINS)}/reference-${(i % 150) + 1}`;

    const dateYear = randInt(2021, 2026);
    const dateMonth = String(randInt(1, 12)).padStart(2, "0");
    const dateDay = String(randInt(1, 28)).padStart(2, "0");
    const dueDate = `${dateYear}-${dateMonth}-${dateDay}`;

    const priority = randChoice(["#high", "#medium", "#low"]);
    const todoStatus1 = randChoice(["[ ]", "[>]", "[x]"]);
    const todoStatus2 = randChoice(["[ ]", "[!]", "[?]"]);

    const content = `---
title: "${note.title}"
aliases: ${JSON.stringify(note.aliases)}
tags: ${JSON.stringify(note.tags)}
---

# ${note.title}

## Context and Overview
This document records technical architecture decisions, operational benchmarks, and production-tested patterns for **${note.title}**.
Designed to satisfy enterprise throughput, low latency SLAs, and strict observability requirements.

## Architecture and Design Decisions
- **Core Engine**: Implements non-blocking, zero-copy buffers with asynchronous workers.
- **Fault Tolerance**: Backed by distributed consensus and circuit-breaker isolation.
- **Observability**: Exposes OpenTelemetry span metrics, Prometheus counters, and structured JSON logs.
- **Reference RFC**: [Standard Technical Specification](${extUrl1})

## Implementation Details
\`\`\`typescript
// Production configuration module for ${note.title}
export interface ServiceConfig {
  nodeId: string;
  maxThroughputRps: number;
  enableDistributedTracing: boolean;
  cacheTtlSeconds: number;
  retryBackoffMs: number;
}

export const defaultConfig: ServiceConfig = {
  nodeId: "node-${(i % 64) + 1}",
  maxThroughputRps: ${randInt(5000, 50000)},
  enableDistributedTracing: true,
  cacheTtlSeconds: ${randInt(60, 3600)},
  retryBackoffMs: ${randInt(50, 500)},
};
\`\`\`

## Related Documents & Knowledge Graph
${wikilinkLines}

## External Documentation & Benchmarks
- [Official Architecture Reference Guide](${extUrl1})
- [Performance Benchmarking Results](${extUrl2})

## Action Items and Todos
- ${todoStatus1} Verify latency and throughput under peak synthetic load ${priority} @due(${dueDate}) #${note.tags[0]}
- ${todoStatus2} Review integration test coverage and sign-off RFC #medium @due(${dueDate}) #${note.tags[1] || "engineering"}
- [-] Deprecate legacy synchronous fallback path #low
`;

    const fullPath = note.folder
      ? path.join(rootTarget, note.folder, note.filename)
      : path.join(rootTarget, note.filename);
    pending.push({ filePath: fullPath, content });
    if (pending.length >= CHUNK_SIZE) {
      await flushNotes();
    }
  }
  await flushNotes();
  console.log("\n[Seed] Notes write complete!");

  console.log("[Seed] Generating 10 years of daily logs in myday/...");
  const startDate = new Date(2016, 8, 1);
  const endDate = new Date(2026, 7, 30);
  const dailyLogs: { dateStr: string; content: string }[] = [];

  const curr = new Date(startDate);
  while (curr <= endDate) {
    const dayOfWeek = curr.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isRecent = curr >= new Date(2026, 6, 1);
    if (!isWeekend || isRecent || rng() < 0.2) {
      const year = curr.getFullYear();
      const month = String(curr.getMonth() + 1).padStart(2, "0");
      const day = String(curr.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const relatedNotes = pickRandom(allNotes, randInt(2, 4));
      const wikilinks = relatedNotes.map((n) => {
        const ref = n.folder
          ? `${n.folder}/${n.filename.replace(/\.md$/, "")}`
          : n.filename.replace(/\.md$/, "");
        return `[[${ref}]]`;
      });

      const extLink = `${randChoice(URL_DOMAINS)}/daily-ref-${randInt(1, 500)}`;

      const morningTasks = [
        `- Stand-up: reviewing shard balance and cluster health with the platform team.`,
        `- [x] Triage nightly integration test results #testing`,
        `- [>] Investigate latency anomaly in ${wikilinks[0]} #high @due(${dateStr}) #debugging`,
      ];

      const deepWorkTopics = [
        `Focused on performance profiling for high-throughput stream processing.`,
        `Reviewed pull request for distributed cache layer. Architecture documented in ${wikilinks[1]}.`,
        `Executed load testing suite against staging cluster. Reference: [Load Test Documentation](${extLink}).`,
        `- [ ] Finalize benchmark report and share with stakeholders #medium @due(${dateStr}) #perf`,
        `- [x] Deploy hotfix to canary environment #${randChoice(TECH_TAGS)}`,
      ];

      const wrapUpTopics = [
        `All latency targets achieved. P99 latency dropped below 15ms.`,
        `Next steps: coordinate with DevOps team on ${wikilinks[2] || wikilinks[0]}.`,
        `End of day sync complete. No unresolved blockers.`,
      ];

      const dailyContent = `# Daily Log: ${dateStr}

## Morning
${morningTasks.join("\n")}

## Deep Work
${deepWorkTopics.join("\n")}

## Wrap-up
${wrapUpTopics.join("\n")}
`;
      dailyLogs.push({ dateStr, content: dailyContent });
    }
    curr.setDate(curr.getDate() + 1);
  }

  console.log(`[Seed] Total daily logs generated: ${dailyLogs.length}`);
  for (let i = 0; i < dailyLogs.length; i += CHUNK_SIZE) {
    const chunk = dailyLogs.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map((log) => {
        const filePath = path.join(rootTarget, "myday", `${log.dateStr}.md`);
        return fs.writeFile(filePath, log.content, "utf-8");
      }),
    );
    process.stdout.write(
      `\r[Seed] Written ${Math.min(i + CHUNK_SIZE, dailyLogs.length)} / ${dailyLogs.length} daily logs`,
    );
  }
  console.log("\n[Seed] Daily logs write complete!");

  console.log(`[Seed] Generating ${TOTAL_LINKS} bookmarks in links.json...`);

  const startTimestamp = new Date(2016, 8, 1).getTime();
  const endTimestamp = new Date(2026, 7, 30).getTime();
  const timeStep = (endTimestamp - startTimestamp) / TOTAL_LINKS;

  const LINK_TOPICS = [
    {
      domain: "https://github.com",
      category: "Open Source Repository",
      tagPrefix: ["oss", "git"],
    },
    {
      domain: "https://huggingface.co",
      category: "AI Model & Dataset Card",
      tagPrefix: ["ai", "models"],
    },
    {
      domain: "https://arxiv.org/abs",
      category: "Computer Science Research Paper",
      tagPrefix: ["research", "paper"],
    },
    {
      domain: "https://docs.rs",
      category: "Rust Crate API Reference",
      tagPrefix: ["rust", "api"],
    },
    {
      domain: "https://kubernetes.io/docs/concepts",
      category: "Kubernetes Architecture Guide",
      tagPrefix: ["k8s", "infra"],
    },
    {
      domain: "https://postgresql.org/docs/current",
      category: "PostgreSQL Database Manual",
      tagPrefix: ["database", "postgres"],
    },
    {
      domain: "https://opentelemetry.io/docs/specs",
      category: "OpenTelemetry Observability Spec",
      tagPrefix: ["otel", "observability"],
    },
    {
      domain: "https://cloud.google.com/architecture",
      category: "Cloud Architecture Pattern",
      tagPrefix: ["cloud", "gcp"],
    },
    {
      domain: "https://aws.amazon.com/blogs/architecture",
      category: "AWS Distributed Systems Deep Dive",
      tagPrefix: ["aws", "cloud"],
    },
    {
      domain: "https://rfc-editor.org/rfc",
      category: "IETF RFC Internet Standard",
      tagPrefix: ["rfc", "networking"],
    },
    {
      domain: "https://developer.mozilla.org/en-US/docs/Web",
      category: "Web Standards & API Docs",
      tagPrefix: ["web", "frontend"],
    },
    {
      domain: "https://vllm.ai/docs",
      category: "High Throughput LLM Engine",
      tagPrefix: ["ai", "vllm"],
    },
    {
      domain: "https://triton-lang.org/docs",
      category: "GPU Programming & Triton Kernels",
      tagPrefix: ["cuda", "gpu"],
    },
    {
      domain: "https://redis.io/docs/data-types",
      category: "Redis In-Memory Data Structures",
      tagPrefix: ["cache", "redis"],
    },
  ];

  const linksPath = path.join(rootTarget, "links.json");
  const linksHandle = await fs.open(linksPath, "w");
  await linksHandle.write("[\n");
  const LINK_CHUNK_SIZE = 2000;
  let linkChunk: string[] = [];
  let linksWritten = 0;
  let firstLinkChunk = true;
  const flushLinks = async () => {
    if (linkChunk.length === 0) return;
    await linksHandle.write(
      (firstLinkChunk ? "" : ",\n") + linkChunk.join(",\n"),
    );
    firstLinkChunk = false;
    linksWritten += linkChunk.length;
    linkChunk = [];
    process.stdout.write(
      `\r[Seed] Written ${linksWritten} / ${TOTAL_LINKS} bookmarks`,
    );
  };

  for (let i = 1; i <= TOTAL_LINKS; i++) {
    const topic = randChoice(LINK_TOPICS);
    const techTerm = randChoice([
      ...AI_DOMAINS,
      ...ARCH_DOMAINS,
      ...INFRA_DOMAINS,
      ...BACKEND_DOMAINS,
      ...SECURITY_DOMAINS,
    ]);
    const cleanSlug = techTerm.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const url = `${topic.domain}/${cleanSlug}-${i}`;
    const title = `${techTerm} - ${topic.category} #${i}`;
    const description = `Production reference and architectural guidelines for ${techTerm}. Key benchmarks, deployment manifests, and troubleshooting runbooks.`;
    const tags = Array.from(
      new Set([...topic.tagPrefix, ...randSample(TECH_TAGS, randInt(2, 4))]),
    );
    const createdAt = Math.floor(
      startTimestamp + i * timeStep + randInt(-3600000, 3600000),
    );

    linkChunk.push(
      JSON.stringify({
        id: `manual-link-${i}-${Math.random().toString(36).substring(2, 8)}`,
        url,
        title,
        description,
        tags,
        createdAt,
        isManual: true,
      }),
    );
    if (linkChunk.length >= LINK_CHUNK_SIZE) {
      await flushLinks();
    }
  }
  await flushLinks();
  await linksHandle.write("\n]");
  await linksHandle.close();
  console.log(`\n[Seed] links.json complete: ${linksWritten} bookmarks.`);

  const configContent = {
    theme: "nord",
    language: "en",
    autoSyncEnabled: false,
    autoSyncIntervalMins: 5,
  };
  await fs.writeFile(
    path.join(rootTarget, "config.json"),
    JSON.stringify(configContent, null, 2),
    "utf-8",
  );

  await fs.writeFile(
    path.join(rootTarget, ".gitignore"),
    ".lyra/\n.env\n*.tmp\n",
    "utf-8",
  );

  console.log("\n=======================================================");
  console.log("✅ Lyra Demo Data Generation Successfully Completed!");
  console.log(
    `📁 Root Memos: ${ROOT_NOTE_COUNT.toLocaleString("en-US")} notes`,
  );
  console.log(
    `📁 ${FOLDERS.length} Category Folders: ${(NOTES_PER_FOLDER * FOLDERS.length).toLocaleString("en-US")} notes (${NOTES_PER_FOLDER.toLocaleString("en-US")} per folder)`,
  );
  console.log(
    `📅 Daily Logs (myday): ${dailyLogs.length} logs (10 years: 2016-2026)`,
  );
  console.log(`🔗 Links (links.json): ${linksWritten} saved bookmarks`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("Error during seed:", err);
  process.exit(1);
});
