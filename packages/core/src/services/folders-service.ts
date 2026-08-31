import * as fs from "fs/promises";
import type { Dirent } from "fs";
import * as path from "path";
import * as i18n from "../i18n";
import {
  getRepoPath,
  ensureDirs,
  resolveFolderPath,
  exists,
  backgroundCommit,
  getEmbeddingService,
  shouldIndexInBackground,
  getRelativePath,
  captureException,
} from "../helpers";
import { CommonResponse } from "../types";

export async function listFolders(): Promise<string[]> {
  const repoPath = getRepoPath();
  await ensureDirs();
  try {
    const entries = await fs.readdir(repoPath, { withFileTypes: true });
    const folders: string[] = [];
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== "attachments" &&
        entry.name !== "myday"
      ) {
        folders.push(entry.name);
      }
    }
    return folders;
  } catch (err) {
    console.error("Error listing folders:", err);
    captureException(err);
    return [];
  }
}

export async function createFolder(
  folderName: string,
): Promise<CommonResponse> {
  if (!folderName || !folderName.trim()) {
    return {
      success: false,
      error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FOLDER_REQUIRED),
    };
  }
  const cleanName = folderName.trim();
  const folderPath = resolveFolderPath(cleanName);
  const repoPath = getRepoPath();
  if (folderPath === repoPath) {
    return {
      success: false,
      error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FOLDER_EXISTS),
    };
  }
  try {
    if (await exists(folderPath)) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FOLDER_EXISTS),
      };
    }
    await fs.mkdir(folderPath, { recursive: true });
    backgroundCommit(
      `docs(folders): create folder "${cleanName}"`,
      path.basename(cleanName),
    );
    return { success: true };
  } catch (err) {
    console.error("Error creating folder:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

export async function renameFolder(
  oldName: string,
  newName: string,
): Promise<CommonResponse> {
  if (!oldName || !newName || !newName.trim()) {
    return {
      success: false,
      error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FOLDER_REQUIRED),
    };
  }
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();
  if (cleanOld === "/" || cleanOld.toLowerCase() === "root") {
    return {
      success: false,
      error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_DELETE_ROOT),
    };
  }
  if (cleanNew === "/" || cleanNew.toLowerCase() === "root") {
    return {
      success: false,
      error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FOLDER_EXISTS),
    };
  }
  if (cleanOld === cleanNew) {
    return { success: true };
  }

  const oldPath = resolveFolderPath(cleanOld);
  const newPath = resolveFolderPath(cleanNew);

  try {
    if (!(await exists(oldPath))) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FILE_NOT_EXIST),
      };
    }
    if (await exists(newPath)) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FOLDER_EXISTS),
      };
    }

    await fs.rename(oldPath, newPath);
    backgroundCommit(
      `docs(folders): rename folder "${cleanOld}" to "${cleanNew}"`,
      [path.basename(cleanOld), path.basename(cleanNew)],
    );

    if (shouldIndexInBackground()) {
      (async () => {
        try {
          const embeddingService = getEmbeddingService();
          const entries = await fs.readdir(newPath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith(".md")) {
              const oldRel = getRelativePath(cleanOld, entry.name);
              const newRel = getRelativePath(cleanNew, entry.name);
              await embeddingService.removeNote(oldRel);
              const filePath = path.join(newPath, entry.name);
              const content = await fs.readFile(filePath, "utf-8");
              const stats = await fs.stat(filePath);
              let title = entry.name.replace(/\.md$/, "");
              const titleMatch = content.match(/^#\s+(.+)$/m);
              if (titleMatch && titleMatch[1].trim()) {
                title = titleMatch[1].trim();
              }
              await embeddingService.indexNote(
                newRel,
                title,
                cleanNew,
                content,
                stats.mtimeMs,
              );
            }
          }
        } catch (embErr) {
          console.error(
            "Failed to update embeddings on folder rename:",
            embErr,
          );
        }
      })().catch((err) => captureException(err));
    }

    return { success: true };
  } catch (err) {
    console.error("Error renaming folder:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteFolder(
  folderName: string,
): Promise<CommonResponse> {
  if (!folderName)
    return {
      success: false,
      error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FOLDER_REQUIRED),
    };
  const cleanName = folderName.trim();
  const folderPath = resolveFolderPath(cleanName);
  const repoPath = getRepoPath();
  if (
    folderPath === repoPath ||
    cleanName === "/" ||
    cleanName.toLowerCase() === "root"
  ) {
    return {
      success: false,
      error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_DELETE_ROOT),
    };
  }
  try {
    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(folderPath, { withFileTypes: true });
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
    const indexedPaths = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => getRelativePath(cleanName, entry.name));
    await fs.rm(folderPath, { recursive: true, force: true });
    backgroundCommit(
      `docs(folders): delete folder "${cleanName}"`,
      path.basename(cleanName),
    );
    if (shouldIndexInBackground()) {
      Promise.all(
        indexedPaths.map((relativePath) =>
          getEmbeddingService().removeNote(relativePath),
        ),
      ).catch((err) => {
        console.error(
          "Failed to remove deleted folder from embedding index:",
          err,
        );
        captureException(err);
      });
    }
    return { success: true };
  } catch (err) {
    console.error("Error deleting folder:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}
