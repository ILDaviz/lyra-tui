import { generateText, Output } from "ai";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs/promises";
import { resolveFolderPath, exists, getEmbeddingService } from "../helpers";
import * as i18n from "../i18n";
import { EmbeddingService } from "./embedding";
import { resolveAiModel, hasConfiguredProvider } from "../ai";
import { RagOptions, RagResponse, RagSource } from "../types";

export const ExtractedTodosSchema = z.object({
  todos: z.array(
    z.object({
      text: z.string().describe("Task description"),
      priority: z.enum(["High", "Medium", "Low"]).describe("Priority level"),
      dueDate: z
        .string()
        .optional()
        .describe("Due date in YYYY-MM-DD format if mentioned"),
      tags: z.array(z.string()).describe("Relevant lowercase category tags"),
    }),
  ),
});

export class EditorAiService {
  private embeddingService?: EmbeddingService;

  constructor(embeddingService?: EmbeddingService) {
    this.embeddingService = embeddingService;
  }

  public async askAI(
    query: string,
    options: RagOptions = {},
  ): Promise<RagResponse> {
    const embeddingService = this.embeddingService || getEmbeddingService();
    const searchResults = await embeddingService.search(query, 5);

    if (searchResults.length === 0) {
      return {
        answer: i18n.t(i18n.CORE_I18N_KEYS.RAG_NO_INFO),
        sources: [],
      };
    }

    const contextParts: string[] = [];
    const sources: RagSource[] = [];

    for (const result of searchResults) {
      if (result.folderName === "links" && result.filename === "links.json") {
        contextParts.push(`Source: ${result.title}\n\n${result.snippet || ""}`);
        sources.push({
          title: result.title,
          filename: result.filename,
          folderName: result.folderName,
        });
        continue;
      }

      const folderPath = resolveFolderPath(result.folderName);
      const filePath = path.join(folderPath, result.filename);

      try {
        if (await exists(filePath)) {
          const content = await fs.readFile(filePath, "utf-8");
          const cleanContent = content.replace(/^#\s+.+$/m, "").trim();

          contextParts.push(
            i18n.t(i18n.CORE_I18N_KEYS.RAG_SOURCE_LABEL, {
              title: result.title,
              folderName: result.folderName,
              filename: result.filename,
              cleanContent,
            }),
          );

          sources.push({
            title: result.title,
            filename: result.filename,
            folderName: result.folderName,
          });
        }
      } catch (err) {
        console.error(`Error reading context file ${filePath}:`, err);
      }
    }

    const context = contextParts.join("\n\n---\n\n");

    const systemPrompt = i18n.t(i18n.CORE_I18N_KEYS.RAG_SYSTEM_PROMPT, {
      context,
    });
    const userMessage = i18n.t(i18n.CORE_I18N_KEYS.RAG_USER_MESSAGE, {
      query,
    });

    const resolved = resolveAiModel(options);

    if (resolved.provider === "openai" && !options.token && !options.apiKey) {
      const isConfigured = hasConfiguredProvider(options);
      if (!isConfigured) {
        throw new Error(
          i18n.t(i18n.CORE_I18N_KEYS.ERROR_OPENAI_TOKEN_REQUIRED),
        );
      }
    }

    try {
      const result = await generateText({
        model: resolved.model,
        system: systemPrompt,
        prompt: userMessage,
        temperature: options.temperature ?? 0.3,
      });

      const answer =
        result.text ||
        (resolved.provider === "openai"
          ? i18n.t(i18n.CORE_I18N_KEYS.ERROR_OPENAI_NO_RESPONSE)
          : i18n.t(i18n.CORE_I18N_KEYS.ERROR_OLLAMA_NO_RESPONSE));

      return {
        answer,
        sources,
      };
    } catch (err: any) {
      console.error(
        `AI generation error with provider ${resolved.provider}:`,
        err,
      );

      if (resolved.provider === "ollama") {
        const url = options.ollamaUrl || "http://localhost:11434";
        const model = options.ollamaModel || options.aiModel || "llama3.3";
        throw new Error(
          i18n.t(i18n.CORE_I18N_KEYS.ERROR_OLLAMA_CONNECT, { url, model }),
          { cause: err },
        );
      }

      throw err;
    }
  }

  public async summarizeNote(
    content: string,
    options: RagOptions = {},
  ): Promise<string> {
    const resolved = resolveAiModel(options);
    const lang = options.language === "it" ? "Italian" : "English";

    const systemPrompt = `You are a concise executive summarizer. 
Summarize the following markdown note in ${lang}.
Highlight key decisions, concepts, and conclusions in 2-4 bullet points followed by a 1-sentence summary.`;

    const { text } = await generateText({
      model: resolved.model,
      system: systemPrompt,
      prompt: content,
      temperature: 0.2,
    });

    return text;
  }

  public async extractTodos(
    content: string,
    options: RagOptions = {},
  ): Promise<string[]> {
    const resolved = resolveAiModel(options);

    const systemPrompt = `You are an actionable task extractor.
Read the provided note and extract all tasks, action items, or todos.
Format them as actionable concise bullet points.`;

    try {
      const { output: data } = await generateText({
        model: resolved.model,
        output: Output.object({ schema: ExtractedTodosSchema }),
        system: systemPrompt,
        prompt: content,
        temperature: 0.2,
      });

      if (data && data.todos) {
        return data.todos.map((t) => {
          const priorityTag =
            t.priority === "High"
              ? " #high"
              : t.priority === "Low"
                ? " #low"
                : "";
          const dueTag = t.dueDate ? ` @due(${t.dueDate})` : "";
          const tagsStr =
            t.tags && t.tags.length > 0
              ? ` ${t.tags.map((tag) => `#${tag}`).join(" ")}`
              : "";
          return `- [ ] ${t.text}${priorityTag}${dueTag}${tagsStr}`;
        });
      }
    } catch {
      const fallbackPrompt = `${systemPrompt}
Return only markdown checklist items formatted as:
- [ ] Task description #priority @due(YYYY-MM-DD) #tag`;

      const { text } = await generateText({
        model: resolved.model,
        system: fallbackPrompt,
        prompt: content,
        temperature: 0.2,
      });

      return text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("- [ ]") || l.startsWith("- [ ]"));
    }

    return [];
  }

  public async improveWriting(
    content: string,
    options: RagOptions = {},
  ): Promise<string> {
    const resolved = resolveAiModel(options);
    const lang = options.language === "it" ? "Italian" : "English";

    const systemPrompt = `You are a professional copywriter and editor.
Improve the clarity, tone, and grammar of the provided text while preserving its original meaning and markdown structure.
Respond in ${lang} with ONLY the revised text. Do not add intro/outro commentary.`;

    const { text } = await generateText({
      model: resolved.model,
      system: systemPrompt,
      prompt: content,
      temperature: 0.3,
    });

    return text;
  }

  public async translateText(
    content: string,
    targetLanguage: string,
    options: RagOptions = {},
  ): Promise<string> {
    const resolved = resolveAiModel(options);

    const systemPrompt = `You are a professional translator.
Translate the following text into ${targetLanguage}.
Preserve markdown formatting, code blocks, checklists, and headings.
Output ONLY the translated content with no extra commentary.`;

    const { text } = await generateText({
      model: resolved.model,
      system: systemPrompt,
      prompt: content,
      temperature: 0.2,
    });

    return text;
  }

  public async continueWriting(
    content: string,
    options: RagOptions = {},
  ): Promise<string> {
    const resolved = resolveAiModel(options);

    const systemPrompt = `You are a thoughtful writing assistant.
Continue writing naturally from where the text ends, matching its exact tone, language, style, and markdown formatting.
Output ONLY the continued text without repeating the existing text or adding meta-commentary.`;

    const { text } = await generateText({
      model: resolved.model,
      system: systemPrompt,
      prompt: content,
      temperature: 0.6,
    });

    return text;
  }

  public async fixSpelling(
    content: string,
    options: RagOptions = {},
  ): Promise<string> {
    const resolved = resolveAiModel(options);
    const lang = options.language === "it" ? "Italian" : "English";

    const systemPrompt = `You are an expert proofreader.
Fix all typos, spelling errors, punctuation, and grammatical mistakes in the provided text while preserving its exact formatting, markdown syntax, and meaning.
Respond in ${lang} with ONLY the corrected text. Do not add any explanatory text.`;

    const { text } = await generateText({
      model: resolved.model,
      system: systemPrompt,
      prompt: content,
      temperature: 0.1,
    });

    return text;
  }

  public async expandText(
    content: string,
    options: RagOptions = {},
  ): Promise<string> {
    const resolved = resolveAiModel(options);
    const lang = options.language === "it" ? "Italian" : "English";

    const systemPrompt = `You are a creative and articulate writer.
Expand and elaborate on the ideas in the provided text, adding depth, useful context, and clear explanations while preserving markdown structure.
Respond in ${lang} with ONLY the expanded text.`;

    const { text } = await generateText({
      model: resolved.model,
      system: systemPrompt,
      prompt: content,
      temperature: 0.5,
    });

    return text;
  }

  public async simplifyText(
    content: string,
    options: RagOptions = {},
  ): Promise<string> {
    const resolved = resolveAiModel(options);
    const lang = options.language === "it" ? "Italian" : "English";

    const systemPrompt = `You are an expert editor who makes complex writing clear, simple, and concise.
Simplify the provided text to make it easy to understand without losing key information.
Respond in ${lang} with ONLY the simplified text.`;

    const { text } = await generateText({
      model: resolved.model,
      system: systemPrompt,
      prompt: content,
      temperature: 0.2,
    });

    return text;
  }

  public async changeTone(
    content: string,
    tone: "informal" | "formal",
    options: RagOptions = {},
  ): Promise<string> {
    const resolved = resolveAiModel(options);
    const lang = options.language === "it" ? "Italian" : "English";
    const toneDescription =
      tone === "informal"
        ? "casual, friendly, conversational, and approachable"
        : "professional, formal, objective, and polished";

    const systemPrompt = `You are a skilled stylistic editor.
Rewrite the provided text using a ${toneDescription} tone while preserving the original intent and markdown structure.
Respond in ${lang} with ONLY the rewritten text.`;

    const { text } = await generateText({
      model: resolved.model,
      system: systemPrompt,
      prompt: content,
      temperature: 0.4,
    });

    return text;
  }

  public async customInstruction(
    content: string,
    instruction: string,
    options: RagOptions = {},
  ): Promise<string> {
    const resolved = resolveAiModel(options);
    const lang = options.language === "it" ? "Italian" : "English";

    const systemPrompt = `You are an intelligent note assistant.
Follow the user's specific instruction to transform or analyze the provided note.
Instruction: ${instruction}
Respond in ${lang} with ONLY the resulting text. Do not wrap in commentary unless asked.`;

    const { text } = await generateText({
      model: resolved.model,
      system: systemPrompt,
      prompt: content,
      temperature: 0.3,
    });

    return text;
  }

  public async rewrite(
    content: string,
    instructions?: string,
    options: RagOptions = {},
  ): Promise<string> {
    const resolved = resolveAiModel(options);
    const lang = options.language === "it" ? "Italian" : "English";

    const additionalInstructions = instructions?.trim()
      ? `\nAdditional user guidelines/instructions:\n${instructions.trim()}`
      : "";

    const systemPrompt = `You are an expert editor and rewriter.
Rewrite and refine the provided note/memo in ${lang} to improve clarity, flow, structure, and overall quality while preserving all key information and markdown formatting.${additionalInstructions}
Respond in ${lang} with ONLY the rewritten text. Do not add intro/outro commentary.`;

    const { text } = await generateText({
      model: resolved.model,
      system: systemPrompt,
      prompt: content,
      temperature: 0.3,
    });

    return text;
  }

  public async riscrivi(
    content: string,
    instructions?: string,
    options: RagOptions = {},
  ): Promise<string> {
    return this.rewrite(content, instructions, options);
  }

  public async rewriteNote(
    content: string,
    instructions?: string,
    options: RagOptions = {},
  ): Promise<string> {
    return this.rewrite(content, instructions, options);
  }
}

let _editorAiServiceInstance: EditorAiService | null = null;

export function getEditorAiService(): EditorAiService {
  if (!_editorAiServiceInstance) {
    _editorAiServiceInstance = new EditorAiService();
  }
  return _editorAiServiceInstance;
}
