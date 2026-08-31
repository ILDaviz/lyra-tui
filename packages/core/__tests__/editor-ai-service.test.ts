import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorAiService } from "../src/services/editor-ai";
import { EmbeddingService } from "../src/services/embedding";
import { resetServices } from "../src/helpers";
import { autofillLink } from "../src/services/link-metadata";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const mockGenerateText = vi.fn();
const lookupMock = vi.fn().mockResolvedValue([{ address: "93.184.216.34" }]);

vi.mock("node:dns/promises", () => ({
  lookup: (...args: any[]) => lookupMock(...args),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: (...args: any[]) => mockGenerateText(...args),
  };
});

describe("EditorAiService - RAG & askAI", () => {
  let testRepoPath = "";
  let originalRepoPathEnv: string | undefined;
  let embeddingService: EmbeddingService;
  let editorAi: EditorAiService;

  beforeEach(async () => {
    testRepoPath = await fs.mkdtemp(path.join(os.tmpdir(), "lyra-rag-test-"));
    originalRepoPathEnv = process.env.LYRA_REPO_PATH;
    process.env.LYRA_REPO_PATH = testRepoPath;
    resetServices();
    mockGenerateText.mockReset();

    embeddingService = new EmbeddingService();
    editorAi = new EditorAiService(embeddingService);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (originalRepoPathEnv === undefined) {
      delete process.env.LYRA_REPO_PATH;
    } else {
      process.env.LYRA_REPO_PATH = originalRepoPathEnv;
    }
    resetServices();
    await fs.rm(testRepoPath, { recursive: true, force: true }).catch(() => {});
  });

  it("returns no_info message if no search results are found", async () => {
    vi.spyOn(embeddingService, "search").mockResolvedValue([]);

    const result = await editorAi.askAI("test query", {
      provider: "openai",
      token: "sk-test",
    });

    expect(result.sources).toEqual([]);
    expect(result.answer).toBeTruthy();
  });

  it("gathers context and calls generateText on AI SDK", async () => {
    const testFile = path.join(testRepoPath, "note1.md");
    await fs.writeFile(
      testFile,
      "# Note 1\nThis is content about architecture.",
      "utf-8",
    );

    vi.spyOn(embeddingService, "search").mockResolvedValue([
      {
        id: "1",
        title: "Note 1",
        filename: "note1.md",
        folderName: "/",
        score: 0.9,
      },
    ]);

    mockGenerateText.mockResolvedValue({
      text: "Based on your notes, architecture is described.",
    });

    const result = await editorAi.askAI("Tell me about architecture", {
      provider: "openai",
      token: "sk-test-key",
    });

    expect(mockGenerateText).toHaveBeenCalled();
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].title).toBe("Note 1");
    expect(result.answer).toBe(
      "Based on your notes, architecture is described.",
    );
  });

  it("uses indexed link content as RAG context", async () => {
    vi.spyOn(embeddingService, "search").mockResolvedValue([
      {
        title: "Link: Architecture Guide",
        filename: "links.json",
        folderName: "links",
        snippet: "Link URL: https://example.com/architecture",
      },
    ]);
    mockGenerateText.mockResolvedValue({
      text: "Architecture reference found.",
    });

    const result = await editorAi.askAI("architecture", {
      provider: "openai",
      token: "sk-test-key",
    });

    expect(result.sources).toEqual([
      {
        title: "Link: Architecture Guide",
        filename: "links.json",
        folderName: "links",
      },
    ]);
    expect(mockGenerateText.mock.calls[0][0].system).toContain(
      "https://example.com/architecture",
    );
  });

  it("throws error if OpenAI token is missing and provider is not configured", async () => {
    const testFile = path.join(testRepoPath, "note1.md");
    await fs.writeFile(testFile, "# Note 1\nContent.", "utf-8");

    vi.spyOn(embeddingService, "search").mockResolvedValue([
      {
        id: "1",
        title: "Note 1",
        filename: "note1.md",
        folderName: "/",
        score: 0.9,
      },
    ]);

    await expect(
      editorAi.askAI("query", { provider: "openai" }),
    ).rejects.toThrow();
  });
});

describe("EditorAiService - Writing Actions", () => {
  let editorAi: EditorAiService;

  beforeEach(() => {
    mockGenerateText.mockReset();
    editorAi = new EditorAiService();
  });

  it("summarizes a note content", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Summary: Key concepts covered.",
    });

    const summary = await editorAi.summarizeNote(
      "# My Long Note\nLots of text.",
      {
        provider: "openai",
        token: "sk-test",
      },
    );

    expect(mockGenerateText).toHaveBeenCalled();
    expect(summary).toBe("Summary: Key concepts covered.");
  });

  it("extracts structured todos from note content", async () => {
    mockGenerateText.mockResolvedValue({
      output: {
        todos: [
          {
            text: "Fix login bug",
            priority: "High",
            dueDate: "2026-08-25",
            tags: ["bug", "auth"],
          },
        ],
      },
    });

    const todos = await editorAi.extractTodos(
      "Meeting notes: we must fix login bug by 25th.",
      {
        provider: "openai",
        token: "sk-test",
      },
    );

    expect(mockGenerateText).toHaveBeenCalled();
    expect(todos).toHaveLength(1);
    expect(todos[0]).toContain(
      "- [ ] Fix login bug #high @due(2026-08-25) #bug #auth",
    );
  });

  it("improves, translates, and continues writing", async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: "Improved text." })
      .mockResolvedValueOnce({ text: "Testo tradotto." })
      .mockResolvedValueOnce({ text: "Continued content." });

    const improved = await editorAi.improveWriting("Draft text.", {
      provider: "openai",
      token: "sk",
    });
    expect(improved).toBe("Improved text.");

    const translated = await editorAi.translateText("Hello", "Italian", {
      provider: "openai",
      token: "sk",
    });
    expect(translated).toBe("Testo tradotto.");

    const continued = await editorAi.continueWriting("Start of note...", {
      provider: "openai",
      token: "sk",
    });
    expect(continued).toBe("Continued content.");
  });

  it("fixes spelling, expands, simplifies, changes tone, and runs custom instructions", async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: "Corrected text." })
      .mockResolvedValueOnce({ text: "Expanded detailed text." })
      .mockResolvedValueOnce({ text: "Simple text." })
      .mockResolvedValueOnce({ text: "Informal friendly text." })
      .mockResolvedValueOnce({ text: "Formal polished text." })
      .mockResolvedValueOnce({ text: "Custom transformed text." });

    const fixed = await editorAi.fixSpelling("Mistake in text", {
      provider: "openai",
      token: "sk",
    });
    expect(fixed).toBe("Corrected text.");

    const expanded = await editorAi.expandText("Short idea", {
      provider: "openai",
      token: "sk",
    });
    expect(expanded).toBe("Expanded detailed text.");

    const simplified = await editorAi.simplifyText("Complicated words", {
      provider: "openai",
      token: "sk",
    });
    expect(simplified).toBe("Simple text.");

    const informal = await editorAi.changeTone("Standard", "informal", {
      provider: "openai",
      token: "sk",
    });
    expect(informal).toBe("Informal friendly text.");

    const formal = await editorAi.changeTone("Standard", "formal", {
      provider: "openai",
      token: "sk",
    });
    expect(formal).toBe("Formal polished text.");

    const custom = await editorAi.customInstruction("Note", "Make a table", {
      provider: "openai",
      token: "sk",
    });
    expect(custom).toBe("Custom transformed text.");
  });

  it("rewrites note content with and without additional instructions using rewrite, riscrivi, and rewriteNote", async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: "Rewritten note content." })
      .mockResolvedValueOnce({ text: "Testo memo riscritto secondo istruzioni." })
      .mockResolvedValueOnce({ text: "Note rewritten via rewriteNote." });

    const rewritten = await editorAi.rewrite("Original rough note", undefined, {
      provider: "openai",
      token: "sk",
    });
    expect(rewritten).toBe("Rewritten note content.");

    const riscritto = await editorAi.riscrivi(
      "Bozza nota",
      "Rendila più formale e sintetica",
      {
        provider: "openai",
        token: "sk",
        language: "it",
      },
    );
    expect(riscritto).toBe("Testo memo riscritto secondo istruzioni.");
    expect(mockGenerateText.mock.calls[1][0].system).toContain(
      "Additional user guidelines/instructions:\nRendila più formale e sintetica",
    );

    const rewrittenNote = await editorAi.rewriteNote(
      "Draft",
      "Add bullet points",
      {
        provider: "openai",
        token: "sk",
      },
    );
    expect(rewrittenNote).toBe("Note rewritten via rewriteNote.");
  });
});

describe("LinkMetadataService / autofillLink", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGenerateText.mockReset();
    lookupMock.mockClear();
    lookupMock.mockResolvedValue([{ address: "93.184.216.34" }]);
  });

  it("autofills link metadata using HTML and AI SDK", async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>AI SDK Documentation</title>
          <meta name="description" content="TypeScript toolkit for building AI apps" />
        </head>
        <body></body>
      </html>
    `;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(mockHtml, { status: 200 }),
    );

    mockGenerateText.mockResolvedValue({
      output: {
        title: "AI SDK Documentation",
        description: "Official guide to Vercel AI SDK.",
        tags: ["ai", "typescript", "sdk"],
      },
    });

    const result = await autofillLink("https://ai-sdk.dev", {
      provider: "anthropic",
      anthropicApiKey: "sk-ant-test",
    });

    expect(mockGenerateText).toHaveBeenCalled();
    expect(result.title).toBe("AI SDK Documentation");
    expect(result.description).toBe("Official guide to Vercel AI SDK.");
    expect(result.tags).toEqual(["ai", "typescript", "sdk"]);
  });

  it("rejects local addresses before fetching link metadata", async () => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1" }]);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      autofillLink("http://localhost:3000", {}),
    ).rejects.toThrow("Local URLs cannot be fetched");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
