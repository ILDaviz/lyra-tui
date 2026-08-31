import * as fs from "fs/promises";
import * as path from "path";
import {
  getRepoPath,
  getMyDayPath,
  ensureDirs,
  resolveFolderPath,
  exists,
  captureException,
} from "../helpers";

export interface VaultFileListing {
  folders: string[];
  folderFiles: Map<string, string[]>;
  myDayFiles: string[];
  seenPaths: Set<string>;
}

export async function listVaultFolders(): Promise<string[]> {
  const repoPath = getRepoPath();
  const folders: string[] = ["/"];
  try {
    const entries = await fs.readdir(repoPath, { withFileTypes: true });
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
  } catch (err) {
    console.error("Error reading repo directories:", err);
    captureException(err);
  }
  return folders;
}

export async function listVaultFiles(): Promise<VaultFileListing> {
  await ensureDirs();
  const myDayPath = getMyDayPath();
  const folders = await listVaultFolders();

  const myDayFilesPromise = (async (): Promise<string[]> => {
    try {
      if (!(await exists(myDayPath))) return [];
      const entries = await fs.readdir(myDayPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => entry.name);
    } catch (err) {
      console.error("Error scanning myday folder:", err);
      captureException(err);
      return [];
    }
  })();

  const folderResults = await Promise.all(
    folders.map(async (folder): Promise<[string, string[]]> => {
      const folderPath = resolveFolderPath(folder);
      try {
        if (!(await exists(folderPath))) return [folder, []];
        const entries = await fs.readdir(folderPath, { withFileTypes: true });
        const mdFiles = entries
          .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
          .map((entry) => entry.name);
        return [folder, mdFiles];
      } catch (err) {
        console.error(`Error scanning folder ${folder}:`, err);
        captureException(err);
        return [folder, []];
      }
    }),
  );

  const myDayFiles = await myDayFilesPromise;

  const folderFiles = new Map<string, string[]>(folderResults);
  const seenPaths = new Set<string>();
  for (const [folder, files] of folderFiles) {
    const folderPath = resolveFolderPath(folder);
    for (const filename of files) {
      seenPaths.add(path.join(folderPath, filename));
    }
  }
  for (const filename of myDayFiles) {
    seenPaths.add(path.join(myDayPath, filename));
  }

  return { folders, folderFiles, myDayFiles, seenPaths };
}
