import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import {
  listNotes,
  readNote,
  writeNote,
  appendNote,
  createNote,
  deleteNote,
  moveNote,
  isStarterNote,
} from "../src/services/notes-service";
import { createFolder, deleteFolder } from "../src/services/folders-service";
import { getRepoPath } from "../src/helpers";

describe("Notes Service", () => {
  const repoPath = getRepoPath();

  beforeAll(async () => {
    await fs.mkdir(repoPath, { recursive: true });
    await createFolder("NotesTestDir");
  });

  afterAll(async () => {
    await deleteFolder("NotesTestDir").catch(() => {});
  });

  it("should identify starter notes properly", () => {
    expect(
      isStarterNote(
        "Untitled Note.md",
        "# Untitled Note\n\nWrite something here...",
      ),
    ).toBe(true);
    expect(
      isStarterNote(
        "My Custom Note.md",
        "# My Custom Note\n\nsome real content",
      ),
    ).toBe(false);
  });

  it("should write, read, list, move, and delete note", async () => {
    const writeRes = await writeNote({
      folderName: "NotesTestDir",
      filename: "test-note.md",
      content: "# Test Title\n\nHello note body.",
    });

    expect(writeRes.success).toBe(true);
    expect(writeRes.title).toBe("Test Title");

    const readRes = await readNote("NotesTestDir", "test-note.md");
    expect(readRes.success).toBe(true);
    expect(readRes.content).toContain("Hello note body.");

    const notes = await listNotes("NotesTestDir");
    expect(notes.some((n) => n.filename === "test-note.md")).toBe(true);

    await createFolder("NotesTestDir2");
    const moveRes = await moveNote(
      "NotesTestDir",
      "test-note.md",
      "NotesTestDir2",
    );
    expect(moveRes.success).toBe(true);

    const deleteRes = await deleteNote("NotesTestDir2", "test-note.md");
    expect(deleteRes.success).toBe(true);
    await deleteFolder("NotesTestDir2");
  });

  it("should append text to an existing or new note without overwriting", async () => {
    const newAppendRes = await appendNote({
      folderName: "NotesTestDir",
      filename: "append-test.md",
      content: "# Initial Title\n\nFirst paragraph.",
    });
    expect(newAppendRes.success).toBe(true);

    const firstRead = await readNote("NotesTestDir", "append-test.md");
    expect(firstRead.content).toBe("# Initial Title\n\nFirst paragraph.");

    const secondAppendRes = await appendNote({
      folderName: "NotesTestDir",
      filename: "append-test.md",
      content: "## Section 2\n\nAppended paragraph.",
    });
    expect(secondAppendRes.success).toBe(true);

    const secondRead = await readNote("NotesTestDir", "append-test.md");
    expect(secondRead.content).toContain("# Initial Title\n\nFirst paragraph.");
    expect(secondRead.content).toContain("## Section 2\n\nAppended paragraph.");
    expect(secondRead.content).toBe(
      "# Initial Title\n\nFirst paragraph.\n\n## Section 2\n\nAppended paragraph.",
    );

    await deleteNote("NotesTestDir", "append-test.md");
  });

  it("rejects unsafe filenames and does not overwrite a created note", async () => {
    const createRes = await createNote({
      folderName: "NotesTestDir",
      filename: "agent-create.md",
      content: "Original content",
    });
    expect(createRes.success).toBe(true);

    const duplicateRes = await createNote({
      folderName: "NotesTestDir",
      filename: "agent-create.md",
      content: "Replacement content",
    });
    expect(duplicateRes.success).toBe(false);

    const traversalRead = await readNote("NotesTestDir", "../outside.md");
    expect(traversalRead.success).toBe(false);
    const traversalWrite = await writeNote({
      folderName: "NotesTestDir",
      filename: "../outside.md",
      content: "must not write",
    });
    expect(traversalWrite.success).toBe(false);

    const unchanged = await readNote("NotesTestDir", "agent-create.md");
    expect(unchanged.content).toBe("Original content");
    await deleteNote("NotesTestDir", "agent-create.md");
  });

  it("should retrieve history and restore note version when git is active", async () => {
    const git = (await import("../src/helpers")).getGitService();
    await git.init();

    await createFolder("HistoryTestDir");

    await writeNote({
      folderName: "HistoryTestDir",
      filename: "history-note.md",
      content: "# Version 1\n\nFirst version of the note.",
    });
    await git.commit(
      'docs(notes): update note "history-note.md"',
      "HistoryTestDir/history-note.md",
    );

    await writeNote({
      folderName: "HistoryTestDir",
      filename: "history-note.md",
      content: "# Version 2\n\nSecond version of the note.",
    });
    await git.commit(
      'docs(notes): update note "history-note.md"',
      "HistoryTestDir/history-note.md",
    );

    const {
      isGitActive,
      getNoteHistory,
      getNoteContentAtCommit,
      restoreNoteVersion,
    } = await import("../src/services/notes-service");

    const active = await isGitActive();
    expect(active).toBe(true);

    const history = await getNoteHistory("HistoryTestDir", "history-note.md");
    expect(history.length).toBeGreaterThanOrEqual(2);

    const firstCommit = history[history.length - 1];
    const prevContent = await getNoteContentAtCommit(
      "HistoryTestDir",
      "history-note.md",
      firstCommit.hash,
    );
    expect(prevContent).toContain("Version 1");

    const restoreRes = await restoreNoteVersion(
      "HistoryTestDir",
      "history-note.md",
      firstCommit.hash,
    );
    expect(restoreRes.success).toBe(true);
    expect(restoreRes.content).toContain("Version 1");

    const currentNote = await readNote("HistoryTestDir", "history-note.md");
    expect(currentNote.content).toContain("Version 1");

    await deleteFolder("HistoryTestDir").catch(() => {});
  });
});
