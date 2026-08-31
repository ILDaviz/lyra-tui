import { Command } from "commander";
import { listNotes, readNote, writeNote } from "../../services/notes-service";
import { listFolders } from "../../services/folders-service";
import { getMyDayNote, writeMyDayNote } from "../../services/myday-service";
import { getLocalDateString } from "../../helpers";
import { print, printError } from "../output";

export async function noteListAction(
  folder?: string,
  options: { json?: boolean } = {},
): Promise<void> {
  const foldersToScan = folder ? [folder] : ["/", ...(await listFolders())];
  const allNotes: Array<{
    folder: string;
    filename: string;
    title: string;
    updatedAt: number;
  }> = [];

  for (const f of foldersToScan) {
    const notes = await listNotes(f);
    for (const n of notes) {
      allNotes.push({
        folder: f,
        filename: n.filename,
        title: n.title,
        updatedAt: n.updatedAt,
      });
    }
  }

  if (options.json) {
    print(JSON.stringify(allNotes, null, 2));
    return;
  }

  print("\n  \x1b[1;35m✦ Lyra Notes\x1b[0m\n");

  if (allNotes.length === 0) {
    print("  \x1b[90mNo notes found.\x1b[0m\n");
    return;
  }

  let currentFolder = "";
  for (const n of allNotes) {
    if (n.folder !== currentFolder) {
      currentFolder = n.folder;
      print(
        `  \x1b[1;36m📁 ${currentFolder === "/" ? "Root (/)" : currentFolder}\x1b[0m`,
      );
    }
    const dateStr = new Date(n.updatedAt).toLocaleDateString();
    print(
      `     • \x1b[1m${n.title}\x1b[0m \x1b[90m(${n.filename} · mod: ${dateStr})\x1b[0m`,
    );
  }

  print(`\n  \x1b[90mTotal: ${allNotes.length} notes\x1b[0m\n`);
}

export async function noteShowAction(notePath: string): Promise<void> {
  if (!notePath) {
    printError(
      "\x1b[31mError:\x1b[0m Specify note path, e.g. 'folder/Note.md' or 'Note.md'",
    );
    process.exitCode = 1;
    return;
  }

  let folder = "/";
  let filename = notePath;

  if (notePath.includes("/")) {
    const parts = notePath.split("/");
    filename = parts.pop() || "";
    folder = parts.join("/") || "/";
  }

  if (!filename.endsWith(".md")) {
    filename = `${filename}.md`;
  }

  const res = await readNote(folder, filename);
  if (!res.success || typeof res.content !== "string") {
    printError(
      `\x1b[31mError:\x1b[0m Note not found: ${folder === "/" ? "" : folder + "/"}${filename}`,
    );
    process.exitCode = 1;
    return;
  }

  print(res.content);
}

export async function noteNewAction(
  titleParts: string[] | string,
  options: { folder?: string; content?: string; dryRun?: boolean } = {},
): Promise<void> {
  const title = Array.isArray(titleParts) ? titleParts.join(" ") : titleParts;

  if (!title || title.trim().length === 0) {
    printError("\x1b[31mError:\x1b[0m Note title cannot be empty.");
    process.exitCode = 1;
    return;
  }

  const folder = options.folder || "/";
  const cleanTitle = title.trim();
  const filename = `${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
  const initialContent = options.content || `# ${cleanTitle}\n\n`;

  if (options.dryRun) {
    print(
      `\n  \x1b[33mDry run:\x1b[0m would create ${folder === "/" ? "" : `${folder}/`}${filename}\n`,
    );
    return;
  }

  const res = await writeNote({
    folderName: folder,
    filename,
    content: initialContent,
  });

  if (res.success) {
    print(
      `\n  \x1b[32m✔ Note created successfully:\x1b[0m ${folder === "/" ? "" : folder + "/"}${filename}\n`,
    );
  } else {
    printError(`\n  \x1b[31m✖ Error creating note:\x1b[0m ${res.error}\n`);
    process.exitCode = 1;
  }
}

export async function todayAction(
  action?: "show" | "append",
  textParts?: string[] | string,
  options: { dryRun?: boolean } = {},
): Promise<void> {
  const today = getLocalDateString();
  const text = Array.isArray(textParts) ? textParts.join(" ") : textParts;

  if (action === "append" && text) {
    if (options.dryRun) {
      print(
        `\n  \x1b[33mDry run:\x1b[0m would append to Daily Log (${today}): ${text.trim()}\n`,
      );
      return;
    }
    const res = await getMyDayNote(today);
    const current =
      res.success && res.content ? res.content : `# Daily Log: ${today}\n\n`;
    const updated = `${current.trimEnd()}\n${text.trim()}\n`;
    const writeRes = await writeMyDayNote(today, updated);
    if (!writeRes.success) {
      printError(
        `\n  \x1b[31m✖ Error updating Daily Log:\x1b[0m ${writeRes.error}\n`,
      );
      process.exitCode = 1;
      return;
    }
    print(
      `\n  \x1b[32m✔ Added to Daily Log (${today}):\x1b[0m ${text.trim()}\n`,
    );
    return;
  }

  const res = await getMyDayNote(today);

  if (res.success && res.content) {
    print(res.content);
  } else {
    print(`# Daily Log: ${today}\n\n(No entries for today)`);
  }
}

export function registerNotesCommand(program: Command): void {
  const noteCmd = program
    .command("note")
    .alias("notes")
    .description("Manage and inspect markdown notes");

  noteCmd
    .command("list [folder]", { isDefault: true })
    .description("List all notes in vault or a specific folder")
    .option("-j, --json", "Output notes list in JSON format")
    .action(async (folder, options) => {
      await noteListAction(folder, options);
    });

  noteCmd
    .command("show <path>")
    .alias("cat")
    .description("Print raw markdown content of a note to stdout")
    .action(async (notePath) => {
      await noteShowAction(notePath);
    });

  noteCmd
    .command("new <title...>")
    .aliases(["create", "add"])
    .description("Create a new markdown note")
    .option("-f, --folder <folder>", "Target folder name", "/")
    .option("-c, --content <content>", "Initial markdown content")
    .option(
      "--dry-run",
      "Show the note that would be created without writing it",
    )
    .action(async (title, options) => {
      await noteNewAction(title, options);
    });

  const todayCmd = program
    .command("today")
    .alias("myday")
    .description("View or append to today's Daily Log");

  todayCmd
    .command("show", { isDefault: true })
    .description("Display today's daily log")
    .action(async () => {
      await todayAction("show");
    });

  todayCmd
    .command("append <text...>")
    .alias("add")
    .allowUnknownOption(true)
    .option("--dry-run", "Show the append operation without writing it")
    .description("Append text or task to today's Daily Log")
    .action(async (text, options, command) => {
      const raw = command ? command.args : text;
      await todayAction("append", raw, options);
    });
}
