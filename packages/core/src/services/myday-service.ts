import * as fs from "fs/promises";
import * as path from "path";
import {
  getMyDayPath,
  ensureDirs,
  exists,
  backgroundCommit,
  getRelativePath,
  getEmbeddingService,
  shouldIndexInBackground,
  captureException,
} from "../helpers";
import { MyDayMetadata, WriteMyDayResponse } from "../types";

export async function getMyDayNote(dateStr: string): Promise<{
  success: boolean;
  content?: string;
  isNew?: boolean;
  filename?: string;
  updatedAt?: number;
  error?: string;
}> {
  const myDayPath = getMyDayPath();
  const filename = `${dateStr}.md`;
  const filePath = path.join(myDayPath, filename);

  try {
    await ensureDirs();
    let content = "";
    let isNew = false;

    if (!(await exists(filePath))) {
      isNew = true;
      content = "";
      await fs.writeFile(filePath, content, "utf-8");
    } else {
      content = await fs.readFile(filePath, "utf-8");
    }

    const stats = await fs.stat(filePath);
    return {
      success: true,
      content,
      isNew,
      filename,
      updatedAt: stats.mtimeMs,
    };
  } catch (err) {
    console.error("Error getting My Day note:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

export async function writeMyDayNote(
  dateStr: string,
  content: string,
): Promise<WriteMyDayResponse> {
  const myDayPath = getMyDayPath();
  const filename = `${dateStr}.md`;
  const filePath = path.join(myDayPath, filename);
  try {
    await ensureDirs();
    await fs.writeFile(filePath, content, "utf-8");
    const stats = await fs.stat(filePath);
    const relativePath = getRelativePath("myday", filename);
    backgroundCommit(
      `docs(myday): update daily log "${dateStr}"`,
      relativePath,
    );

    if (shouldIndexInBackground()) {
      getEmbeddingService()
        .indexNote(
          relativePath,
          `Daily Log: ${dateStr}`,
          "myday",
          content,
          stats.mtimeMs,
        )
        .catch((err) => {
          console.error("Failed to index daily log:", err);
          captureException(err);
        });
    }

    return {
      success: true,
      filename,
      updatedAt: stats.mtimeMs,
    };
  } catch (err) {
    console.error("Error writing My Day note:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

export async function listMyDayNotes(): Promise<MyDayMetadata[]> {
  const myDayPath = getMyDayPath();
  await ensureDirs();
  try {
    const entries = await fs.readdir(myDayPath, { withFileTypes: true });
    const mdEntries = entries.filter(
      (entry) => entry.isFile() && entry.name.endsWith(".md"),
    );
    const myDayNotes = await Promise.all(
      mdEntries.map(async (entry): Promise<MyDayMetadata> => {
        const dateStr = entry.name.replace(/\.md$/, "");
        const filePath = path.join(myDayPath, entry.name);
        const stats = await fs.stat(filePath);

        return {
          dateStr,
          filename: entry.name,
          updatedAt: stats.mtimeMs,
          hasContent: stats.size > 0,
        };
      }),
    );
    myDayNotes.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
    return myDayNotes;
  } catch (err) {
    console.error("Error listing My Day notes:", err);
    captureException(err);
    return [];
  }
}
