import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
} from "../src/services/folders-service";
import { getRepoPath } from "../src/helpers";

describe("Folders Service", () => {
  let repoPath = "";

  beforeAll(async () => {
    repoPath = getRepoPath();
    await fs.mkdir(repoPath, { recursive: true });
  });

  afterAll(async () => {
    await fs
      .rm(path.join(repoPath, "TestFolder"), { recursive: true, force: true })
      .catch(() => {});
    await fs
      .rm(path.join(repoPath, "RenamedFolder"), {
        recursive: true,
        force: true,
      })
      .catch(() => {});
  });

  it("should create and list folders", async () => {
    const createRes = await createFolder("TestFolder");
    expect(createRes.success).toBe(true);

    const folders = await listFolders();
    expect(folders).toContain("TestFolder");
  });

  it("should rename a folder successfully", async () => {
    const renameRes = await renameFolder("TestFolder", "RenamedFolder");
    expect(renameRes.success).toBe(true);

    const folders = await listFolders();
    expect(folders).not.toContain("TestFolder");
    expect(folders).toContain("RenamedFolder");
  });

  it("should delete a folder successfully", async () => {
    const deleteRes = await deleteFolder("RenamedFolder");
    expect(deleteRes.success).toBe(true);

    const foldersAfter = await listFolders();
    expect(foldersAfter).not.toContain("RenamedFolder");
  });

  it("should not allow creating an already existing folder", async () => {
    await createFolder("DupFolder");
    const res = await createFolder("DupFolder");
    expect(res.success).toBe(false);
    await deleteFolder("DupFolder");
  });

  it("should not allow deleting root folder", async () => {
    const res = await deleteFolder("/");
    expect(res.success).toBe(false);
  });

  it("should not allow renaming root folder", async () => {
    const res = await renameFolder("/", "NewRoot");
    expect(res.success).toBe(false);
  });
});
