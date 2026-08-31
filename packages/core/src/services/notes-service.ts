import * as fs from "fs/promises";
import type * as fsTypes from "fs";
import * as path from "path";
import * as i18n from "../i18n";
import {
  getRepoPath,
  ensureDirs,
  resolveFolderPath,
  resolveNotePath,
  assertPathInsideVault,
  exists,
  backgroundCommit,
  getRelativePath,
  getEmbeddingService,
  shouldIndexInBackground,
  captureException,
  getGitService,
} from "../helpers";
import {
  NoteMetadata,
  WriteNoteResponse,
  CommonResponse,
  GitCommitInfo,
} from "../types";
import { cachedFileScan, pruneScanKind, flushScanCache } from "./scan-cache";

export function isStarterNote(filename: string, content: string): boolean {
  const nameWithoutExt = filename.replace(/\.md$/, "");
  const lowerName = nameWithoutExt.toLowerCase();

  if (
    lowerName.startsWith("untitled note") ||
    lowerName.startsWith("nota senza titolo")
  ) {
    const trimmedContent = content.trim();
    const expectedContent = `# ${nameWithoutExt}\n\nWrite something here...`;

    return (
      trimmedContent === expectedContent ||
      trimmedContent === `# ${nameWithoutExt}` ||
      trimmedContent === ""
    );
  }

  return false;
}

const ATTACHMENTS_DIR_NAME = "attachments";

export function getAttachmentsDir(): string {
  return path.join(getRepoPath(), ATTACHMENTS_DIR_NAME);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function encodeAttachmentUrl(filename: string): string {
  return `${ATTACHMENTS_DIR_NAME}/${encodeURIComponent(filename)}`;
}

export function normalizeDroppedPath(input: string): string {
  let value = input.trim();

  if (value.length > 1) {
    const first = value[0];
    const last = value[value.length - 1];
    if (
      ((first === '"' && last === '"') ||
        (first === "'" && last === "'") ||
        (first === "`" && last === "`")) &&
      !value.slice(1, -1).includes(first)
    ) {
      value = value.slice(1, -1).trim();
    }
  }

  if (value.startsWith("file://")) {
    try {
      value = decodeURIComponent(new URL(value).pathname);
    } catch {
      value = safeDecodeURIComponent(value.slice("file://".length));
    }
  } else {
    value = safeDecodeURIComponent(value);
  }

  value = value.replace(/\\ /g, " ");

  return value.trim();
}

export async function resolveAttachmentPath(
  attachmentUrl: string,
): Promise<string | null> {
  const cleaned = normalizeDroppedPath(attachmentUrl);
  const trimmed = cleaned.replace(/^\.?\//, "");

  if (!trimmed.startsWith(`${ATTACHMENTS_DIR_NAME}/`)) {
    return null;
  }

  const rawFilename = trimmed.slice(ATTACHMENTS_DIR_NAME.length + 1);
  const filename = safeDecodeURIComponent(rawFilename);

  if (
    !filename ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("..")
  ) {
    return null;
  }

  const absolutePath = path.join(getAttachmentsDir(), filename);

  if (!(await exists(absolutePath))) {
    return null;
  }

  try {
    await assertPathInsideVault(absolutePath);
  } catch {
    return null;
  }

  return absolutePath;
}

export function extractAttachments(markdown: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const mdLinkRegex = /\[[^\]]*\]\(\s*<?(.*?)>?\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = mdLinkRegex.exec(markdown)) !== null) {
    const candidate = safeDecodeURIComponent(match[1].trim());
    if (
      (candidate.startsWith(`${ATTACHMENTS_DIR_NAME}/`) ||
        candidate.startsWith(`./${ATTACHMENTS_DIR_NAME}/`)) &&
      !seen.has(candidate)
    ) {
      seen.add(candidate);
      found.push(candidate);
    }
  }

  const wikiLinkRegex = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  while ((match = wikiLinkRegex.exec(markdown)) !== null) {
    const candidate = match[1].trim();
    if (
      (candidate.startsWith(`${ATTACHMENTS_DIR_NAME}/`) ||
        candidate.startsWith(`./${ATTACHMENTS_DIR_NAME}/`)) &&
      !seen.has(candidate)
    ) {
      seen.add(candidate);
      found.push(candidate);
    }
  }

  return found;
}

export async function copyFileAttachment(srcPath: string): Promise<{
  success: boolean;
  url?: string;
  filename?: string;
  error?: string;
}> {
  try {
    if (!(await exists(srcPath))) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FILE_NOT_EXIST),
      };
    }

    const filename = path.basename(srcPath);
    const attachmentsDir = getAttachmentsDir();
    await fs.mkdir(attachmentsDir, { recursive: true });

    let targetFilename = filename;
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let counter = 1;

    while (await exists(path.join(attachmentsDir, targetFilename))) {
      targetFilename = `${base}-${counter}${ext}`;
      counter++;
    }

    const targetPath = path.join(attachmentsDir, targetFilename);
    await fs.copyFile(srcPath, targetPath);

    return {
      success: true,
      url: encodeAttachmentUrl(targetFilename),
      filename: targetFilename,
    };
  } catch (err) {
    console.error("Error copying attachment:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

const NOTE_HEAD_BYTES = 64 * 1024;

async function readNoteHead(filePath: string): Promise<string> {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(NOTE_HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, NOTE_HEAD_BYTES, 0);
    return buffer.toString("utf-8", 0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function listNotes(folderName: string): Promise<NoteMetadata[]> {
  try {
    const folderPath = resolveFolderPath(folderName);
    await ensureDirs();
    if (!(await exists(folderPath))) {
      await fs.mkdir(folderPath, { recursive: true });
    }
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const mdEntries = entries.filter(
      (entry) => entry.isFile() && entry.name.endsWith(".md"),
    );
    const cacheKind = `notes:${folderPath}`;

    const notes = await Promise.all(
      mdEntries.map(async (entry) => {
        const filePath = path.join(folderPath, entry.name);
        let stats: fsTypes.Stats;
        try {
          stats = await fs.stat(filePath);
        } catch {
          return null;
        }

        const meta = await cachedFileScan(
          cacheKind,
          filePath,
          stats,
          async () => {
            const head = await readNoteHead(filePath);

            let title = entry.name.replace(/\.md$/, "");
            const titleMatch = head.match(/^#\s+(.+)$/m);
            if (titleMatch && titleMatch[1].trim()) {
              title = titleMatch[1].trim();
            }

            const cleanContent = head.replace(/^#\s+.+$/m, "").trim();
            const snippet =
              cleanContent.replace(/\s+/g, " ").trim().slice(0, 100) ||
              i18n.t(i18n.CORE_I18N_KEYS.NO_ADDITIONAL_TEXT);

            return { title, snippet };
          },
        );

        return {
          filename: entry.name,
          title: meta.title,
          snippet: meta.snippet,
          updatedAt: stats.mtimeMs,
          createdAt: stats.birthtimeMs,
        } as NoteMetadata;
      }),
    );

    const result = notes.filter((n): n is NoteMetadata => n !== null);
    result.sort((a, b) => b.updatedAt - a.updatedAt);

    const seenPaths = new Set(
      mdEntries.map((entry) => path.join(folderPath, entry.name)),
    );
    await pruneScanKind(cacheKind, seenPaths);
    await flushScanCache();

    return result;
  } catch (err) {
    console.error("Error listing notes:", err);
    captureException(err);
    return [];
  }
}

export async function readNote(
  folderName: string,
  filename: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const folderPath = resolveFolderPath(folderName);
    const filePath = resolveNotePath(folderName, filename);
    if (!(await exists(filePath))) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FILE_NOT_EXIST),
      };
    }
    await assertPathInsideVault(folderPath);
    await assertPathInsideVault(filePath);
    const content = await fs.readFile(filePath, "utf-8");
    return { success: true, content };
  } catch (err) {
    console.error("Error reading note:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

export async function writeNote({
  folderName,
  filename,
  content,
  newFilename,
}: {
  folderName: string;
  filename: string;
  content: string;
  newFilename?: string;
}): Promise<WriteNoteResponse> {
  try {
    const folderPath = resolveFolderPath(folderName);
    const filePath = resolveNotePath(folderName, filename);
    await ensureDirs();
    if (!(await exists(folderPath))) {
      await fs.mkdir(folderPath, { recursive: true });
    }
    await assertPathInsideVault(folderPath);

    let targetFilePath = filePath;
    let finalFilename = filename;

    if (newFilename && newFilename !== filename) {
      const safeNewName = newFilename.endsWith(".md")
        ? newFilename
        : `${newFilename}.md`;
      const newFilePath = resolveNotePath(folderName, safeNewName);
      if (await exists(newFilePath)) {
        return {
          success: false,
          error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FILE_EXISTS),
        };
      }

      if (await exists(filePath)) {
        await fs.unlink(filePath);
      }
      targetFilePath = newFilePath;
      finalFilename = safeNewName;
    }

    if (await exists(targetFilePath)) {
      await assertPathInsideVault(targetFilePath);
    }
    await fs.writeFile(targetFilePath, content, "utf-8");

    const stats = await fs.stat(targetFilePath);
    let title = finalFilename.replace(/\.md$/, "");
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch && titleMatch[1].trim()) {
      title = titleMatch[1].trim();
    }
    const cleanContent = content.replace(/^#\s+.+$/m, "").trim();
    const snippet =
      cleanContent.replace(/\s+/g, " ").trim().slice(0, 100) ||
      i18n.t(i18n.CORE_I18N_KEYS.NO_ADDITIONAL_TEXT);

    const targetName = newFilename || filename;
    const relativePath = getRelativePath(folderName, finalFilename);
    if (!isStarterNote(finalFilename, content)) {
      if (newFilename && newFilename !== filename) {
        const oldRelativePath = getRelativePath(folderName, filename);
        backgroundCommit(`docs(notes): update note "${targetName}"`, [
          oldRelativePath,
          relativePath,
        ]);
      } else {
        backgroundCommit(
          `docs(notes): update note "${targetName}"`,
          relativePath,
        );
      }
    }

    if (shouldIndexInBackground()) {
      (async () => {
        const embeddingService = getEmbeddingService();
        if (newFilename && newFilename !== filename) {
          await embeddingService.removeNote(
            getRelativePath(folderName, filename),
          );
        }
        await embeddingService.indexNote(
          relativePath,
          title,
          folderName,
          content,
          stats.mtimeMs,
        );
      })().catch((err) => {
        console.error("Failed to index note:", err);
        captureException(err);
      });
    }

    return {
      success: true,
      filename: finalFilename,
      title,
      snippet,
      updatedAt: stats.mtimeMs,
    };
  } catch (err) {
    console.error("Error writing note:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

export async function createNote({
  folderName,
  filename,
  content,
}: {
  folderName: string;
  filename: string;
  content: string;
}): Promise<WriteNoteResponse> {
  try {
    const filePath = resolveNotePath(folderName, filename);
    if (await exists(filePath)) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FILE_EXISTS),
      };
    }
    return await writeNote({ folderName, filename, content });
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function appendNote({
  folderName,
  filename,
  content,
}: {
  folderName: string;
  filename: string;
  content: string;
}): Promise<WriteNoteResponse> {
  const readRes = await readNote(folderName, filename);
  let newContent = content;
  if (readRes.success && typeof readRes.content === "string") {
    const existingContent = readRes.content.trimEnd();
    newContent = existingContent ? `${existingContent}\n\n${content}` : content;
  }
  return writeNote({
    folderName,
    filename,
    content: newContent,
  });
}

export async function deleteNote(
  folderName: string,
  filename: string,
): Promise<CommonResponse> {
  try {
    const folderPath = resolveFolderPath(folderName);
    const filePath = resolveNotePath(folderName, filename);
    if (await exists(filePath)) {
      await assertPathInsideVault(folderPath);
      await assertPathInsideVault(filePath);
      await fs.unlink(filePath);
      const relativePath = getRelativePath(folderName, filename);
      backgroundCommit(`docs(notes): delete note "${filename}"`, relativePath);

      if (shouldIndexInBackground()) {
        getEmbeddingService()
          .removeNote(relativePath)
          .catch((err) => {
            console.error("Failed to remove note from index:", err);
            captureException(err);
          });
      }
    }
    return { success: true };
  } catch (err) {
    console.error("Error deleting note:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

export async function moveNote(
  folderName: string,
  filename: string,
  targetFolderName: string,
): Promise<CommonResponse> {
  try {
    const sourceFolderPath = resolveFolderPath(folderName);
    const sourceFilePath = resolveNotePath(folderName, filename);
    const targetFolderPath = resolveFolderPath(targetFolderName);
    const targetFilePath = resolveNotePath(targetFolderName, filename);
    if (!(await exists(sourceFilePath))) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FILE_NOT_EXIST),
      };
    }
    await assertPathInsideVault(sourceFolderPath);
    await assertPathInsideVault(sourceFilePath);
    if (!(await exists(targetFolderPath))) {
      await fs.mkdir(targetFolderPath, { recursive: true });
    }
    await assertPathInsideVault(targetFolderPath);
    if (await exists(targetFilePath)) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_FILE_EXISTS),
      };
    }
    await fs.rename(sourceFilePath, targetFilePath);

    const relativeSourcePath = getRelativePath(folderName, filename);
    const relativeTargetPath = getRelativePath(targetFolderName, filename);
    backgroundCommit(
      `docs(notes): move note "${filename}" from "${folderName}" to "${targetFolderName}"`,
      [relativeSourcePath, relativeTargetPath],
    );

    if (shouldIndexInBackground()) {
      (async () => {
        const stats = await fs.stat(targetFilePath);
        const content = await fs.readFile(targetFilePath, "utf-8");
        let title = filename.replace(/\.md$/, "");
        const titleMatch = content.match(/^#\s+(.+)$/m);
        if (titleMatch && titleMatch[1].trim()) {
          title = titleMatch[1].trim();
        }
        const embeddingService = getEmbeddingService();
        await embeddingService.removeNote(relativeSourcePath);
        await embeddingService.indexNote(
          relativeTargetPath,
          title,
          targetFolderName,
          content,
          stats.mtimeMs,
        );
      })().catch((err) => {
        console.error("Failed to update embedding index on move:", err);
        captureException(err);
      });
    }

    return { success: true };
  } catch (err) {
    console.error("Error moving note:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

export async function isGitActive(): Promise<boolean> {
  try {
    const git = getGitService();
    const available = await git.checkGitAvailability();
    if (!available) return false;
    return await git.isGitRepo();
  } catch {
    return false;
  }
}

export async function getNoteHistory(
  folderName: string,
  filename: string,
): Promise<GitCommitInfo[]> {
  try {
    const git = getGitService();
    const isRepo = await git.isGitRepo();
    if (!isRepo) return [];
    const relativePath = getRelativePath(folderName, filename);
    return await git.getHistory(relativePath);
  } catch (err) {
    console.error("Error getting note history:", err);
    captureException(err);
    return [];
  }
}

export async function getNoteContentAtCommit(
  folderName: string,
  filename: string,
  commitHash: string,
): Promise<string> {
  const git = getGitService();
  const relativePath = getRelativePath(folderName, filename);
  return await git.getFileContentAtCommit(commitHash, relativePath);
}

export async function restoreNoteVersion(
  folderName: string,
  filename: string,
  commitHash: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const git = getGitService();
    const relativePath = getRelativePath(folderName, filename);
    await git.restoreFile(commitHash, relativePath);
    const res = await readNote(folderName, filename);
    if (res.success && typeof res.content === "string") {
      const folderPath = resolveFolderPath(folderName);
      const filePath = path.join(folderPath, filename);
      const stats = await fs.stat(filePath);
      let title = filename.replace(/\.md$/, "");
      const titleMatch = res.content.match(/^#\s+(.+)$/m);
      if (titleMatch && titleMatch[1].trim()) {
        title = titleMatch[1].trim();
      }
      if (shouldIndexInBackground()) {
        getEmbeddingService()
          .indexNote(
            relativePath,
            title,
            folderName,
            res.content,
            stats.mtimeMs,
          )
          .catch((err) => {
            console.error("Failed to re-index note on restore:", err);
            captureException(err);
          });
      }
      return { success: true, content: res.content };
    }
    return { success: true };
  } catch (err: any) {
    console.error("Error restoring note version:", err);
    captureException(err);
    return { success: false, error: err.message };
  }
}
