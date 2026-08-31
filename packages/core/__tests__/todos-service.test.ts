import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  scanTodos,
  toggleTodo,
  cycleTodoStatus,
  setTodoStatus,
  setTodoPriority,
  parseTodoMetadata,
  getStatusFromChar,
  getCharFromStatus,
  addTodo,
  updateTodo,
} from "../src/services/todos-service";
import { readNote, writeNote, deleteNote } from "../src/services/notes-service";
import { createFolder, deleteFolder } from "../src/services/folders-service";
import { setLocale } from "../src/i18n";

describe("Todos Service (Multi-state Markdown)", () => {
  beforeAll(async () => {
    setLocale("en");
    await createFolder("TodoTestDir");
    await writeNote({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      content: [
        "# Multi State Tasks",
        "- [ ] Regular task @due(2026-08-25) #backend",
        "- [>] Task in progress @priority(high)",
        "- [!] Urgent task needing attention",
        "- [?] Task with question / waiting",
        "- [-] Paused task",
        "- [x] Completed task",
      ].join("\n"),
    });
  });

  afterAll(async () => {
    setLocale("en");
    await deleteNote("TodoTestDir", "multi-state-todos.md").catch(() => {});
    await deleteFolder("TodoTestDir").catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
  });

  it("should parse metadata correctly", () => {
    const meta1 = parseTodoMetadata(
      "Buy milk @due(2026-08-25) #groceries @priority(high)",
    );
    expect(meta1.priority).toBe("High");
    expect(meta1.dueDate).toBe("2026-08-25");
    expect(meta1.tags).toContain("groceries");

    const meta2 = parseTodoMetadata("Fix bug #p1");
    expect(meta2.priority).toBe("High");

    const meta3 = parseTodoMetadata("Read docs #low");
    expect(meta3.priority).toBe("Low");

    const metaIt1 = parseTodoMetadata("Comprare pane #alta @due(2026-08-27)");
    expect(metaIt1.priority).toBe("High");
    expect(metaIt1.tags).not.toContain("alta");

    const metaIt2 = parseTodoMetadata("Attività @priority(bassa)");
    expect(metaIt2.priority).toBe("Low");

    const metaIt3 = parseTodoMetadata("Altra cosa !media");
    expect(metaIt3.priority).toBe("Medium");
  });

  it("should get status from char", () => {
    expect(getStatusFromChar(" ").status).toBe("todo");
    expect(getStatusFromChar(">").status).toBe("in_progress");
    expect(getStatusFromChar("!").status).toBe("urgent");
    expect(getStatusFromChar("?").status).toBe("question");
    expect(getStatusFromChar("-").status).toBe("paused");
    expect(getStatusFromChar("x").status).toBe("done");
  });

  it("should scan all multi-state tasks correctly", async () => {
    const todos = await scanTodos();
    const tRegular = todos.find((t) => t.text.includes("Regular task"));
    const tProgress = todos.find((t) => t.text.includes("Task in progress"));
    const tUrgent = todos.find((t) => t.text.includes("Urgent task"));
    const tQuestion = todos.find((t) => t.text.includes("Task with question"));
    const tPaused = todos.find((t) => t.text.includes("Paused task"));
    const tCompleted = todos.find((t) => t.text.includes("Completed task"));

    expect(tRegular?.status).toBe("todo");
    expect(tRegular?.dueDate).toBe("2026-08-25");
    expect(tRegular?.tags).toContain("backend");

    expect(tProgress?.status).toBe("in_progress");
    expect(tProgress?.priority).toBe("High");

    expect(tUrgent?.status).toBe("urgent");
    expect(tUrgent?.priority).toBe("High");

    expect(tQuestion?.status).toBe("question");

    expect(tPaused?.status).toBe("paused");
    expect(tPaused?.done).toBe(false);

    expect(tCompleted?.status).toBe("done");
    expect(tCompleted?.done).toBe(true);
  });

  it("should cycle todo status correctly", async () => {
    const cycle1 = await cycleTodoStatus({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 0,
    });
    expect(cycle1.success).toBe(true);
    expect(cycle1.newStatus).toBe("in_progress");

    const cycle2 = await cycleTodoStatus({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 0,
    });
    expect(cycle2.success).toBe(true);
    expect(cycle2.newStatus).toBe("urgent");

    await toggleTodo({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 0,
      done: false,
    });
  });

  it("does not rewrite a file when the todo index does not exist", async () => {
    const before = await readNote("TodoTestDir", "multi-state-todos.md");
    const result = await toggleTodo({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 999,
      done: true,
    });
    const after = await readNote("TodoTestDir", "multi-state-todos.md");

    expect(result).toEqual({ success: false, error: "Todo not found" });
    expect(after.content).toBe(before.content);
  });

  it("should get char from status", () => {
    expect(getCharFromStatus("todo")).toBe(" ");
    expect(getCharFromStatus("in_progress")).toBe(">");
    expect(getCharFromStatus("urgent")).toBe("!");
    expect(getCharFromStatus("question")).toBe("?");
    expect(getCharFromStatus("paused")).toBe("-");
    expect(getCharFromStatus("done")).toBe("x");
  });

  it("should cycle through the full status order including question", async () => {
    const cycle1 = await cycleTodoStatus({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 2,
    });
    expect(cycle1.success).toBe(true);
    expect(cycle1.newStatus).toBe("question");

    const cycle2 = await cycleTodoStatus({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 2,
    });
    expect(cycle2.success).toBe(true);
    expect(cycle2.newStatus).toBe("done");

    const cycle3 = await cycleTodoStatus({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 2,
    });
    expect(cycle3.success).toBe(true);
    expect(cycle3.newStatus).toBe("todo");
  });

  it("should set a specific status directly", async () => {
    const res = await setTodoStatus({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 1,
      status: "paused",
    });
    expect(res.success).toBe(true);
    expect(res.newStatus).toBe("paused");

    const todos = await scanTodos();
    const updated = todos.find((t) => t.text.includes("Task in progress"));
    expect(updated?.status).toBe("paused");
    expect(updated?.done).toBe(false);

    const restore = await setTodoStatus({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 1,
      status: "in_progress",
    });
    expect(restore.success).toBe(true);

    const restored = (await scanTodos()).find((t) =>
      t.text.includes("Task in progress"),
    );
    expect(restored?.status).toBe("in_progress");
    expect(restored?.done).toBe(false);
  });

  it("should set priority directly, replacing existing markers", async () => {
    const res1 = await setTodoPriority({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 0,
      priority: "High",
    });
    expect(res1.success).toBe(true);
    expect(res1.newPriority).toBe("High");

    let t = (await scanTodos()).find((t) => t.text.includes("Regular task"));
    expect(t?.priority).toBe("High");
    expect(t?.tags).toContain("backend");
    expect(t?.dueDate).toBe("2026-08-25");

    await setTodoPriority({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 0,
      priority: "Low",
    });
    t = (await scanTodos()).find((t) => t.text.includes("Regular task"));
    expect(t?.priority).toBe("Low");
    expect(t?.rawText).not.toMatch(/#high/i);

    await setTodoPriority({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 0,
      priority: "Medium",
    });
    t = (await scanTodos()).find((t) => t.text.includes("Regular task"));
    expect(t?.priority).toBe("Medium");
    expect(t?.rawText).not.toMatch(/#high|#medium|#low/i);

    await setTodoPriority({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 1,
      priority: "Low",
    });
    const t1 = (await scanTodos()).find((t) =>
      t.text.includes("Task in progress"),
    );
    expect(t1?.priority).toBe("Low");
    expect(t1?.rawText).not.toMatch(/@priority\(high\)/i);

    await setTodoPriority({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 1,
      priority: "High",
    });
  });

  it("adds without replacing existing note content and updates a matching todo", async () => {
    await writeNote({
      folderName: "TodoTestDir",
      filename: "agent-todos.md",
      content: "# Agent Todos\n\nExisting context",
    });
    const addResult = await addTodo({
      folderName: "TodoTestDir",
      filename: "agent-todos.md",
      text: "First agent task",
      priority: "High",
    });
    expect(addResult.success).toBe(true);

    const todo = (await scanTodos()).find(
      (item) =>
        item.filename === "agent-todos.md" && item.text === "First agent task",
    );
    expect(todo).toBeDefined();

    const updateResult = await updateTodo({
      folderName: todo!.folderName,
      filename: todo!.filename,
      index: todo!.index,
      expectedRawText: todo!.rawText,
      text: "Rewritten agent task",
      priority: "Low",
      dueDate: "2026-09-01",
      tags: ["agent"],
      status: "in_progress",
    });
    expect(updateResult.success).toBe(true);

    const updated = (await scanTodos()).find(
      (item) => item.filename === "agent-todos.md",
    );
    expect(updated?.text).toBe("Rewritten agent task");
    expect(updated?.status).toBe("in_progress");
    expect(updated?.priority).toBe("Low");
    expect(updated?.dueDate).toBe("2026-09-01");
    expect(updated?.tags).toContain("agent");

    const content = await readNote("TodoTestDir", "agent-todos.md");
    expect(content.content).toContain("Existing context");
    await deleteNote("TodoTestDir", "agent-todos.md");
  });

  it("should return localized error messages based on active locale", async () => {
    setLocale("en");
    const enErr1 = await addTodo({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      text: "",
    });
    expect(enErr1.error).toBe("Todo text is required");

    const enErr2 = await updateTodo({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: -1,
      text: "Test",
    });
    expect(enErr2.error).toBe("Invalid todo index");

    const enErr3 = await toggleTodo({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 999,
      done: true,
    });
    expect(enErr3.error).toBe("Todo not found");

    setLocale("it");
    const itErr1 = await addTodo({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      text: "",
    });
    expect(itErr1.error).toBe("Il testo del todo è obbligatorio");

    const itErr2 = await updateTodo({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: -1,
      text: "Test",
    });
    expect(itErr2.error).toBe("Indice del todo non valido");

    const itErr3 = await toggleTodo({
      folderName: "TodoTestDir",
      filename: "multi-state-todos.md",
      index: 999,
      done: true,
    });
    expect(itErr3.error).toBe("Todo non trovato");

    setLocale("en");
  });
});
