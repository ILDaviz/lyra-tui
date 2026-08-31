import { Command } from "commander";
import { scanTodos, toggleTodo } from "../../services/todos-service";
import { TodoStatus } from "../../types";
import { getLocalDateString } from "../../helpers";
import { writeNote, readNote } from "../../services/notes-service";
import { getMyDayNote, writeMyDayNote } from "../../services/myday-service";
import { print, printError } from "../output";

const todoStatuses = new Set<TodoStatus | "all" | "cancelled">([
  "all",
  "done",
  "todo",
  "in_progress",
  "urgent",
  "paused",
  "cancelled",
  "question",
]);
const todoPriorities = new Set(["high", "medium", "low"]);

function validateDueDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function getStatusBadge(status?: TodoStatus): string {
  switch (status) {
    case "done":
      return "\x1b[32m[✔ Done]\x1b[0m";
    case "in_progress":
      return "\x1b[33m[⏳ Progress]\x1b[0m";
    case "urgent":
      return "\x1b[1;31m[! Urgent]\x1b[0m";
    case "paused":
    case "cancelled" as any:
      return "\x1b[90m[⏸ Paused]\x1b[0m";
    case "question":
      return "\x1b[35m[? Question]\x1b[0m";
    case "todo":
    default:
      return "\x1b[36m[  Todo  ]\x1b[0m";
  }
}

export async function todoListAction(
  options: {
    status?: string;
    priority?: string;
    folder?: string;
    all?: boolean;
    json?: boolean;
  } = {},
): Promise<void> {
  const allTodos = await scanTodos();
  let filtered = allTodos;

  if (options.status && options.status !== "all") {
    filtered = filtered.filter((t) => t.status === options.status);
  } else if (!options.all && !options.status) {
    filtered = filtered.filter((t) => !t.done);
  }

  if (options.priority) {
    const prio = options.priority.toLowerCase();
    filtered = filtered.filter(
      (t) => (t.priority || "normal").toLowerCase() === prio,
    );
  }

  if (options.folder) {
    filtered = filtered.filter((t) => t.folderName === options.folder);
  }

  if (options.json) {
    print(JSON.stringify(filtered, null, 2));
    return;
  }

  print("\n  \x1b[1;35m✦ Lyra Tasks & Todos\x1b[0m\n");

  if (filtered.length === 0) {
    print("  \x1b[90mNo tasks found with the specified filters.\x1b[0m\n");
    return;
  }

  filtered.forEach((item, idx) => {
    const badge = getStatusBadge(item.status);
    const prioBadge =
      item.priority === "High"
        ? "\x1b[1;31m#high\x1b[0m "
        : item.priority === "Low"
          ? "\x1b[34m#low\x1b[0m "
          : "";
    const dueBadge = item.dueDate
      ? `\x1b[33m@due(${item.dueDate})\x1b[0m `
      : "";
    const tagsBadge =
      item.tags && item.tags.length > 0
        ? `\x1b[36m${item.tags.map((tg) => `#${tg}`).join(" ")}\x1b[0m `
        : "";

    const source =
      item.folderName === "myday"
        ? `📅 Daily Log (${item.filename.replace(/\.md$/, "")})`
        : `📁 ${item.folderName === "/" ? "Root" : item.folderName}/${item.filename}`;

    print(
      `  ${String(idx + 1).padStart(2, " ")}. ${badge} ${prioBadge}${dueBadge}${item.text}`,
    );
    print(
      `      \x1b[90m${source} [line ${item.index + 1}]\x1b[0m ${tagsBadge}`,
    );
  });

  print(
    `\n  \x1b[90mTotal: ${filtered.length} tasks displayed (${allTodos.length} total in vault)\x1b[0m\n`,
  );
}

export async function todoAddAction(
  textParts: string[] | string,
  options: {
    today?: boolean;
    folder?: string;
    file?: string;
    priority?: string;
    due?: string;
    dryRun?: boolean;
  } = {},
): Promise<void> {
  const text = Array.isArray(textParts) ? textParts.join(" ") : textParts;

  if (!text || text.trim().length === 0) {
    printError("\x1b[31mError:\x1b[0m Task text cannot be empty.");
    process.exitCode = 1;
    return;
  }

  const priorityTag =
    options.priority?.toLowerCase() === "high"
      ? " #high"
      : options.priority?.toLowerCase() === "low"
        ? " #low"
        : "";
  const dueTag = options.due ? ` @due(${options.due})` : "";
  const todoLine = `- [ ] ${text.trim()}${priorityTag}${dueTag}\n`;

  if (options.today || (!options.folder && !options.file)) {
    const today = getLocalDateString();
    if (options.dryRun) {
      print(
        `\n  \x1b[33mDry run:\x1b[0m would add task to Today (${today}): ${text.trim()}${priorityTag}${dueTag}\n`,
      );
      return;
    }
    const myDayRes = await getMyDayNote(today);
    const existingContent =
      myDayRes.success && myDayRes.content
        ? myDayRes.content
        : `# Daily Log: ${today}\n\n`;
    const newContent = `${existingContent.trimEnd()}\n${todoLine}`;
    const writeRes = await writeMyDayNote(today, newContent);
    if (!writeRes.success) {
      printError(`\n  \x1b[31m✖ Error adding task:\x1b[0m ${writeRes.error}\n`);
      process.exitCode = 1;
      return;
    }
    print(
      `\n  \x1b[32m✔ Task added to Today (${today}):\x1b[0m ${text.trim()}${priorityTag}${dueTag}\n`,
    );
    return;
  }

  const folder = options.folder || "/";
  const filename = options.file || "Inbox.md";
  if (options.dryRun) {
    print(
      `\n  \x1b[33mDry run:\x1b[0m would add task to ${folder === "/" ? "" : `${folder}/`}${filename}: ${text.trim()}${priorityTag}${dueTag}\n`,
    );
    return;
  }
  const noteRes = await readNote(folder, filename);

  let content: string;
  if (noteRes.success && typeof noteRes.content === "string") {
    content = `${noteRes.content.trimEnd()}\n${todoLine}`;
  } else {
    content = `# ${filename.replace(/\.md$/, "")}\n\n${todoLine}`;
  }

  const writeRes = await writeNote({ folderName: folder, filename, content });
  if (!writeRes.success) {
    printError(`\n  \x1b[31m✖ Error adding task:\x1b[0m ${writeRes.error}\n`);
    process.exitCode = 1;
    return;
  }
  print(
    `\n  \x1b[32m✔ Task added to ${folder === "/" ? "" : folder + "/"}${filename}:\x1b[0m ${text.trim()}${priorityTag}${dueTag}\n`,
  );
}

export async function todoToggleAction(
  folder: string,
  file: string,
  line: string,
  options: { dryRun?: boolean } = {},
): Promise<void> {
  const folderName = folder || "/";
  const filename = file;
  const index = Number(line);
  if (!Number.isSafeInteger(index) || index < 0) {
    printError(
      "\x1b[31mError:\x1b[0m Task index must be a non-negative integer.",
    );
    process.exitCode = 1;
    return;
  }

  const allTodos = await scanTodos();
  const target = allTodos.find(
    (t) =>
      t.folderName === folderName &&
      t.filename === filename &&
      t.index === index,
  );

  if (!target) {
    printError(
      `\x1b[31mError:\x1b[0m Task not found in ${folderName}/${filename} at index ${index}.`,
    );
    process.exitCode = 1;
    return;
  }

  const newDone = !target.done;
  if (options.dryRun) {
    print(
      `\n  \x1b[33mDry run:\x1b[0m would ${newDone ? "complete" : "reopen"} task in ${folderName}/${filename} (index ${index})\n`,
    );
    return;
  }
  const res = await toggleTodo({
    folderName,
    filename,
    index,
    done: newDone,
  });

  if (res.success) {
    print(
      `\n  \x1b[32m✔ Task ${newDone ? "completed" : "reopened"}\x1b[0m in ${folderName}/${filename} (line ${index + 1})\n`,
    );
  } else {
    printError(`\n  \x1b[31m✖ Error:\x1b[0m ${res.error}\n`);
    process.exitCode = 1;
  }
}

export function registerTodoCommand(program: Command): void {
  const todoCmd = program
    .command("todo")
    .aliases(["todos", "task", "tasks"])
    .description("Manage tasks, action items and checklists");

  todoCmd
    .command("list", { isDefault: true })
    .description("List tasks and todos in the vault")
    .option(
      "-s, --status <status>",
      "Filter by status (all|done|todo|in_progress|urgent|paused|question)",
    )
    .option("-p, --priority <priority>", "Filter by priority (high|medium|low)")
    .option("-f, --folder <folder>", "Filter by folder name")
    .option("-a, --all", "Show all tasks including completed ones")
    .option("-j, --json", "Output in structured JSON format")
    .action(async (options) => {
      if (options.status && !todoStatuses.has(options.status.toLowerCase())) {
        throw new Error(
          `Invalid status "${options.status}". Use all, done, todo, in_progress, urgent, paused, or question.`,
        );
      }
      if (
        options.priority &&
        !todoPriorities.has(options.priority.toLowerCase())
      ) {
        throw new Error(
          `Invalid priority "${options.priority}". Use high, medium, or low.`,
        );
      }
      if (options.status) options.status = options.status.toLowerCase();
      if (options.priority) options.priority = options.priority.toLowerCase();
      await todoListAction(options);
    });

  todoCmd
    .command("add <text...>")
    .description("Add a new task to your vault or daily log")
    .option(
      "--today",
      "Add task to today's Daily Log (default if no note specified)",
    )
    .option("-f, --folder <folder>", "Target note folder")
    .option("--file <file>", "Target note filename")
    .option("-p, --priority <priority>", "Priority tag (high|medium|low)")
    .option("-d, --due <date>", "Due date (YYYY-MM-DD)")
    .option("--dry-run", "Show the task that would be added without writing it")
    .action(async (text, options) => {
      if (
        options.priority &&
        !todoPriorities.has(options.priority.toLowerCase())
      ) {
        throw new Error(
          `Invalid priority "${options.priority}". Use high, medium, or low.`,
        );
      }
      if (options.due && !validateDueDate(options.due)) {
        throw new Error(
          `Invalid due date "${options.due}". Use a valid YYYY-MM-DD date.`,
        );
      }
      await todoAddAction(text, options);
    });

  todoCmd
    .command("toggle <folder> <file> <line>")
    .description("Toggle task completion state at a specific note and line")
    .option("--dry-run", "Show the toggle operation without writing it")
    .action(async (folder, file, line, options) => {
      await todoToggleAction(folder, file, line, options);
    });
}
