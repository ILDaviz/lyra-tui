export interface NoteMetadata {
  filename: string;
  title: string;
  snippet: string;
  updatedAt: number;
  createdAt: number;
}

export interface MyDayMetadata {
  dateStr: string;
  filename: string;
  updatedAt: number;
  hasContent: boolean;
}

export interface ActiveNote {
  filename: string;
  folderName: string;
  title: string;
  content: string;
  updatedAt?: number;
  isDirty?: boolean;
}

export interface ActiveMyDayNote {
  dateStr: string;
  content: string;
  filename: string;
  updatedAt?: number;
}

export interface WriteNoteResponse {
  success: boolean;
  filename?: string;
  title?: string;
  snippet?: string;
  updatedAt?: number;
  error?: string;
}

export interface CommonResponse {
  success: boolean;
  error?: string;
}

export interface WriteMyDayResponse {
  success: boolean;
  filename?: string;
  updatedAt?: number;
  error?: string;
}

export type TodoStatus =
  | "todo"
  | "in_progress"
  | "urgent"
  | "question"
  | "paused"
  | "done";

export interface TodoItem {
  folderName: string;
  filename: string;
  noteTitle: string;
  text: string;
  rawText: string;
  done: boolean;
  priority: string;
  status?: TodoStatus;
  statusChar?: string;
  dueDate?: string;
  tags?: string[];
  index: number;
}

export interface LinkItem {
  id: string;
  url: string;
  title: string;
  description?: string;
  tags?: string[];
  createdAt: number;
  isManual: boolean;
  folderName?: string;
  filename?: string;
  noteTitle?: string;
}

export interface GitCommitInfo {
  hash: string;
  author: string;
  date: string;
  timestamp: number;
  message: string;
}

export type AiProvider =
  "openai" | "anthropic" | "google" | "ollama" | "custom" | "gateway";

export interface AppConfig {
  customRepoPath?: string;
  autoSyncEnabled?: boolean;
  autoSyncIntervalMins?: number;
  language?: "en" | "it";
  aiProvider?: AiProvider;
  aiModel?: string;
  openaiToken?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  customApiKey?: string;
  customBaseUrl?: string;
  aiGatewayKey?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
}

export interface RagOptions {
  provider?: AiProvider | "openai" | "ollama";
  token?: string;
  apiKey?: string;
  aiModel?: string;
  model?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  customApiKey?: string;
  customBaseUrl?: string;
  aiGatewayKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  ollamaUrl?: string;
  ollamaModel?: string;
  language?: "en" | "it";
  temperature?: number;
  messages?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}

export interface RagSource {
  title: string;
  filename: string;
  folderName: string;
}

export interface RagResponse {
  answer: string;
  sources: RagSource[];
}

export interface GraphNode {
  id: string;
  filename: string;
  folderName: string;
  title: string;
  aliases: string[];
  tags: string[];
  exists: boolean;
  isUnresolved?: boolean;
  connectionsCount: number;
  inDegree: number;
  outDegree: number;
}

export type GraphEdgeType = "wikilink" | "markdown" | "tag" | "embed";

export interface GraphEdge {
  source: string;
  target: string;
  type: GraphEdgeType;
  rawTarget: string;
  alias?: string;
  heading?: string;
  lineSnippet?: string;
}

export interface BacklinkContext {
  sourceId: string;
  sourceTitle: string;
  sourceFilename: string;
  sourceFolder: string;
  lineSnippet?: string;
  alias?: string;
  heading?: string;
}

export interface VaultGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  adjacency: Record<string, { outgoing: string[]; incoming: string[] }>;
  tags: Record<string, string[]>;
}

export interface LocalGraphResult {
  node: GraphNode;
  backlinks: BacklinkContext[];
  forwardLinks: GraphNode[];
  subgraphNodes: GraphNode[];
  subgraphEdges: GraphEdge[];
}
