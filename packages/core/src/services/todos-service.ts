import * as fs from "fs/promises";
import * as path from "path";
import {
  getMyDayPath,
  ensureDirs,
  resolveFolderPath,
  exists,
  backgroundCommit,
  getRelativePath,
  captureException,
} from "../helpers";
import { TodoItem, TodoStatus, WriteNoteResponse } from "../types";
import * as i18n from "../i18n";
import { appendNote, readNote, writeNote } from "./notes-service";
import {
  cachedFileScan,
  pruneScanKind,
  flushScanCache,
} from "./scan-cache";
import { listVaultFiles } from "./vault-scan";

export function parseTodoMetadata(text: string): {
  priority: string;
  dueDate?: string;
  tags: string[];
  cleanText: string;
} {
  let priority = "Medium";
  const cleanText = text.trim();
  let dueDate: string | undefined;
  const tags: string[] = [];

  const dueMatch = cleanText.match(/@due\(([^)]+)\)|due:(\d{4}-\d{2}-\d{2})/i);
  if (dueMatch) {
    dueDate = dueMatch[1] || dueMatch[2];
  }

  const {
    highRegex,
    mediumRegex,
    lowRegex,
    stripPriorityRegex,
    stripBracketPriorityRegex,
  } = i18n.getPriorityRegexPatterns();
  const allPriorityTerms = i18n.getAllPriorityTerms();
  const excludedTags = new Set([...allPriorityTerms, "p1", "p2", "p3"]);

  const tagMatches = [...cleanText.matchAll(/(?:^|\s)#([a-zA-Z0-9_-]+)/g)];
  for (const tm of tagMatches) {
    const tag = tm[1].toLowerCase();
    if (!excludedTags.has(tag)) {
      tags.push(tag);
    }
  }

  if (highRegex.test(cleanText)) {
    priority = "High";
  } else if (lowRegex.test(cleanText)) {
    priority = "Low";
  } else if (mediumRegex.test(cleanText)) {
    priority = "Medium";
  }

  const strippedText = cleanText
    .replace(/@due\([^)]+\)/gi, "")
    .replace(/due:\d{4}-\d{2}-\d{2}/gi, "")
    .replace(/@priority\([^)]+\)/gi, "")
    .replace(stripPriorityRegex, " ")
    .replace(stripBracketPriorityRegex, " ")
    .replace(/(?:^|\s)#([a-zA-Z0-9_-]+)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return { priority, dueDate, tags, cleanText: strippedText || text.trim() };
}

export function getStatusFromChar(char: string): {
  status: TodoStatus;
  done: boolean;
  defaultPriority?: string;
} {
  switch (char) {
    case ">":
    case "/":
      return { status: "in_progress", done: false };
    case "!":
      return { status: "urgent", done: false, defaultPriority: "High" };
    case "?":
      return { status: "question", done: false };
    case "-":
      return { status: "paused", done: false };
    case "x":
    case "X":
      return { status: "done", done: true };
    case " ":
    default:
      return { status: "todo", done: false };
  }
}

const TODO_SCAN_KIND = "todos";
const MD_TODO_REGEX = /^(\s*[-*+]\s+\[)([\s xX>/!?-])(\]\s+)(.*)$/;

function parseTodosFromContent(
  content: string,
  folderName: string,
  filename: string,
): TodoItem[] {
  let title = filename.replace(/\.md$/, "");
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch && titleMatch[1].trim()) {
    title = titleMatch[1].trim();
  }

  const items: TodoItem[] = [];
  let index = 0;

  for (const line of content.split(/\r?\n/)) {
    const mdMatch = line.match(MD_TODO_REGEX);
    if (mdMatch) {
      const checkChar = mdMatch[2];
      const rawText = mdMatch[4] || "";
      const { status, done, defaultPriority } = getStatusFromChar(checkChar);
      const meta = parseTodoMetadata(rawText);
      const priority =
        defaultPriority && meta.priority === "Medium"
          ? defaultPriority
          : meta.priority;

      items.push({
        folderName,
        filename,
        noteTitle: title,
        text: meta.cleanText || i18n.t(i18n.CORE_I18N_KEYS.EMPTY_TODO),
        rawText,
        done,
        priority,
        status,
        statusChar: checkChar,
        dueDate: meta.dueDate,
        tags: meta.tags,
        index,
      });
      index++;
    }
  }
  return items;
}

export function resolveNoteFilePath(
  folderName: string,
  filename: string,
): string {
  const myDayPath = getMyDayPath();
  return folderName === "myday"
    ? path.join(myDayPath, filename)
    : path.join(resolveFolderPath(folderName), filename);
}

export async function scanTodosForFile(
  folderName: string,
  filename: string,
): Promise<TodoItem[]> {
  const filePath = resolveNoteFilePath(folderName, filename);
  try {
    const stat = await fs.stat(filePath);
    const items = await cachedFileScan(
      TODO_SCAN_KIND,
      filePath,
      stat,
      async () => {
        const content = await fs.readFile(filePath, "utf-8");
        return parseTodosFromContent(content, folderName, filename);
      },
    );
    return items;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error(`Error extracting todos from ${filePath}:`, err);
      captureException(err);
    }
    return [];
  }
}

export async function scanTodos(): Promise<TodoItem[]> {
  await ensureDirs();

  const { folderFiles, myDayFiles, seenPaths } = await listVaultFiles();

  async function extractTodosFromNote(
    folderName: string,
    filename: string,
  ): Promise<TodoItem[]> {
    const filePath = resolveNoteFilePath(folderName, filename);

    try {
      const stat = await fs.stat(filePath);
      return await cachedFileScan(TODO_SCAN_KIND, filePath, stat, async () => {
        const content = await fs.readFile(filePath, "utf-8");
        return parseTodosFromContent(content, folderName, filename);
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
        console.error(`Error extracting todos from ${filePath}:`, err);
        captureException(err);
      }
      return [];
    }
  }

  const tasks: Promise<TodoItem[]>[] = [];
  for (const filename of myDayFiles) {
    tasks.push(extractTodosFromNote("myday", filename));
  }
  for (const [folder, files] of folderFiles) {
    for (const filename of files) {
      tasks.push(extractTodosFromNote(folder, filename));
    }
  }
  const todoItems = (await Promise.all(tasks)).flat();

  await pruneScanKind(TODO_SCAN_KIND, seenPaths);
  await flushScanCache();

  return todoItems;
}

export async function toggleTodo({
  folderName,
  filename,
  index,
  done,
}: {
  folderName: string;
  filename: string;
  index: number;
  done: boolean;
}): Promise<{ success: boolean; content?: string; error?: string }> {
  const myDayPath = getMyDayPath();
  let filePath: string;
  if (folderName === "myday") {
    filePath = path.join(myDayPath, filename);
  } else {
    filePath = path.join(resolveFolderPath(folderName), filename);
  }

  try {
    if (!(await exists(filePath))) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FILE_NOT_EXIST),
      };
    }
    const content = await fs.readFile(filePath, "utf-8");

    const lines = content.split(/\r?\n/);
    let count = 0;
    let updated = false;
    const mdTodoRegex = /^(\s*[-*+]\s+\[)([\s xX>/!?-])(\]\s+)(.*)$/;

    const updatedLines = lines.map((line) => {
      const mdMatch = line.match(mdTodoRegex);
      if (mdMatch) {
        if (count === index) {
          count++;
          updated = true;
          const prefix = mdMatch[1];
          const suffix = mdMatch[3];
          const rawText = mdMatch[4];
          const newCheck = done ? "x" : " ";
          return `${prefix}${newCheck}${suffix}${rawText}`;
        }
        count++;
        return line;
      }

      return line;
    });

    if (!updated) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_TODO_NOT_FOUND),
      };
    }

    const updatedContent = updatedLines.join("\n");
    await fs.writeFile(filePath, updatedContent, "utf-8");
    const relativePath = getRelativePath(folderName, filename);
    backgroundCommit(
      `chore(todos): toggle todo in "${filename}"`,
      relativePath,
    );
    return { success: true, content: updatedContent };
  } catch (err) {
    console.error("Error toggling todo:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

export async function cycleTodoStatus({
  folderName,
  filename,
  index,
}: {
  folderName: string;
  filename: string;
  index: number;
}): Promise<{
  success: boolean;
  content?: string;
  newStatus?: TodoStatus;
  error?: string;
}> {
  const myDayPath = getMyDayPath();
  let filePath: string;
  if (folderName === "myday") {
    filePath = path.join(myDayPath, filename);
  } else {
    filePath = path.join(resolveFolderPath(folderName), filename);
  }

  try {
    if (!(await exists(filePath))) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FILE_NOT_EXIST),
      };
    }
    const content = await fs.readFile(filePath, "utf-8");

    const lines = content.split(/\r?\n/);
    let count = 0;
    const mdTodoRegex = /^(\s*[-*+]\s+\[)([\s xX>/!?-])(\]\s+)(.*)$/;
    let resolvedStatus: TodoStatus = "todo";

    const statusCycle: Record<string, string> = {
      " ": ">",
      ">": "!",
      "/": "!",
      "!": "?",
      "?": "x",
      "-": " ",
      x: " ",
      X: " ",
    };

    const updatedLines = lines.map((line) => {
      const mdMatch = line.match(mdTodoRegex);
      if (mdMatch) {
        if (count === index) {
          count++;
          const prefix = mdMatch[1];
          const currentChar = mdMatch[2];
          const suffix = mdMatch[3];
          const rawText = mdMatch[4];
          const nextChar = statusCycle[currentChar] || "x";
          resolvedStatus = getStatusFromChar(nextChar).status;
          return `${prefix}${nextChar}${suffix}${rawText}`;
        }
        count++;
        return line;
      }
      return line;
    });

    const updatedContent = updatedLines.join("\n");
    await fs.writeFile(filePath, updatedContent, "utf-8");
    const relativePath = getRelativePath(folderName, filename);
    backgroundCommit(
      `chore(todos): cycle status to "${resolvedStatus}" in "${filename}"`,
      relativePath,
    );
    return {
      success: true,
      content: updatedContent,
      newStatus: resolvedStatus,
    };
  } catch (err) {
    console.error("Error cycling todo status:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

export async function setTodoPriority({
  folderName,
  filename,
  index,
  priority,
}: {
  folderName: string;
  filename: string;
  index: number;
  priority: string;
}): Promise<{
  success: boolean;
  content?: string;
  newPriority?: string;
  error?: string;
}> {
  const myDayPath = getMyDayPath();
  let filePath: string;
  if (folderName === "myday") {
    filePath = path.join(myDayPath, filename);
  } else {
    filePath = path.join(resolveFolderPath(folderName), filename);
  }

  try {
    if (!(await exists(filePath))) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FILE_NOT_EXIST),
      };
    }
    const content = await fs.readFile(filePath, "utf-8");

    const lines = content.split(/\r?\n/);
    let count = 0;
    const mdTodoRegex = /^(\s*[-*+]\s+\[)([\s xX>/!?-])(\]\s+)(.*)$/;
    const normalized =
      priority === "High" || priority === "Low" ? priority : "Medium";

    const updatedLines = lines.map((line) => {
      const mdMatch = line.match(mdTodoRegex);
      if (mdMatch) {
        if (count === index) {
          count++;
          const prefix = mdMatch[1];
          const checkChar = mdMatch[2];
          const suffix = mdMatch[3];
          const rawText = mdMatch[4];
          const { stripPriorityRegex, stripBracketPriorityRegex } =
            i18n.getPriorityRegexPatterns();
          const stripped = rawText
            .replace(stripPriorityRegex, " ")
            .replace(stripBracketPriorityRegex, " ")
            .replace(/\s+/g, " ")
            .trim();
          const marker =
            normalized === "High"
              ? "#high"
              : normalized === "Low"
                ? "#low"
                : "";
          const newText = [stripped, marker].filter(Boolean).join(" ");
          return `${prefix}${checkChar}${suffix}${newText}`;
        }
        count++;
        return line;
      }
      return line;
    });

    const updatedContent = updatedLines.join("\n");
    await fs.writeFile(filePath, updatedContent, "utf-8");
    const relativePath = getRelativePath(folderName, filename);
    backgroundCommit(
      `chore(todos): set priority to "${normalized}" in "${filename}"`,
      relativePath,
    );
    return {
      success: true,
      content: updatedContent,
      newPriority: normalized,
    };
  } catch (err) {
    console.error("Error setting todo priority:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

export function getCharFromStatus(status: TodoStatus): string {
  switch (status) {
    case "in_progress":
      return ">";
    case "urgent":
      return "!";
    case "question":
      return "?";
    case "paused":
    case "cancelled" as any:
      return "-";
    case "done":
      return "x";
    case "todo":
    default:
      return " ";
  }
}

export async function setTodoStatus({
  folderName,
  filename,
  index,
  status,
}: {
  folderName: string;
  filename: string;
  index: number;
  status: TodoStatus;
}): Promise<{
  success: boolean;
  content?: string;
  newStatus?: TodoStatus;
  error?: string;
}> {
  const myDayPath = getMyDayPath();
  let filePath: string;
  if (folderName === "myday") {
    filePath = path.join(myDayPath, filename);
  } else {
    filePath = path.join(resolveFolderPath(folderName), filename);
  }

  try {
    if (!(await exists(filePath))) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FILE_NOT_EXIST),
      };
    }
    const content = await fs.readFile(filePath, "utf-8");

    const lines = content.split(/\r?\n/);
    let count = 0;
    const mdTodoRegex = /^(\s*[-*+]\s+\[)([\s xX>/!?-])(\]\s+)(.*)$/;
    const newChar = getCharFromStatus(status);

    const updatedLines = lines.map((line) => {
      const mdMatch = line.match(mdTodoRegex);
      if (mdMatch) {
        if (count === index) {
          count++;
          const prefix = mdMatch[1];
          const suffix = mdMatch[3];
          const rawText = mdMatch[4];
          return `${prefix}${newChar}${suffix}${rawText}`;
        }
        count++;
        return line;
      }
      return line;
    });

    const updatedContent = updatedLines.join("\n");
    await fs.writeFile(filePath, updatedContent, "utf-8");
    const relativePath = getRelativePath(folderName, filename);
    backgroundCommit(
      `chore(todos): set status to "${status}" in "${filename}"`,
      relativePath,
    );
    return { success: true, content: updatedContent, newStatus: status };
  } catch (err) {
    console.error("Error setting todo status:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

function formatTodoText({
  text,
  priority = "Medium",
  dueDate,
  tags = [],
}: {
  text: string;
  priority?: string;
  dueDate?: string;
  tags?: string[];
}): string {
  const cleanText = text.replace(/[\r\n]+/g, " ").trim();
  const priorityTag =
    priority === "High" ? " #high" : priority === "Low" ? " #low" : "";
  const dueTag = dueDate ? ` @due(${dueDate})` : "";
  const tagsText = tags
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter((tag) => /^[a-zA-Z0-9_-]+$/.test(tag))
    .map((tag) => `#${tag}`)
    .join(" ");
  return `${cleanText}${priorityTag}${dueTag}${tagsText ? ` ${tagsText}` : ""}`;
}

export async function addTodo({
  folderName,
  filename,
  text,
  priority,
  dueDate,
  tags,
}: {
  folderName: string;
  filename: string;
  text: string;
  priority?: string;
  dueDate?: string;
  tags?: string[];
}): Promise<WriteNoteResponse> {
  const formattedText = formatTodoText({ text, priority, dueDate, tags });
  if (!formattedText) {
    return {
      success: false,
      error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_TODO_TEXT_REQUIRED),
    };
  }
  return appendNote({
    folderName,
    filename,
    content: `- [ ] ${formattedText}`,
  });
}

export async function updateTodo({
  folderName,
  filename,
  index,
  expectedRawText,
  text,
  priority,
  dueDate,
  tags,
  status,
}: {
  folderName: string;
  filename: string;
  index: number;
  expectedRawText?: string;
  text: string;
  priority?: string;
  dueDate?: string;
  tags?: string[];
  status?: TodoStatus;
}): Promise<{ success: boolean; content?: string; error?: string }> {
  if (!Number.isInteger(index) || index < 0) {
    return {
      success: false,
      error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_INVALID_TODO_INDEX),
    };
  }

  const note = await readNote(folderName, filename);
  if (!note.success || typeof note.content !== "string") {
    return { success: false, error: note.error };
  }

  const lines = note.content.split(/\r?\n/);
  const mdTodoRegex = /^(\s*[-*+]\s+\[)([\s xX>/!?-])(\]\s+)(.*)$/;
  let todoIndex = 0;
  let updated = false;
  let stale = false;
  const updatedLines = lines.map((line) => {
    const match = line.match(mdTodoRegex);
    if (!match) return line;
    if (todoIndex++ !== index) return line;

    const rawText = match[4] || "";
    if (expectedRawText !== undefined && rawText !== expectedRawText) {
      stale = true;
      return line;
    }

    const metadata = parseTodoMetadata(rawText);
    const nextText = formatTodoText({
      text,
      priority: priority || metadata.priority,
      dueDate: dueDate === undefined ? metadata.dueDate : dueDate,
      tags: tags || metadata.tags,
    });
    const nextStatus = status ? getCharFromStatus(status) : match[2];
    updated = true;
    return `${match[1]}${nextStatus}${match[3]}${nextText}`;
  });

  if (stale) {
    return {
      success: false,
      error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_TODO_CHANGED),
    };
  }
  if (!updated) {
    return {
      success: false,
      error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_TODO_NOT_FOUND),
    };
  }

  const content = updatedLines.join("\n");
  const result = await writeNote({ folderName, filename, content });
  return result.success
    ? { success: true, content }
    : { success: false, error: result.error };
}
