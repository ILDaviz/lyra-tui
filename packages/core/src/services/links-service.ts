import * as fs from "fs/promises";
import * as path from "path";
import {
  getRepoPath,
  ensureDirs,
  exists,
  backgroundCommit,
  getEmbeddingService,
  shouldIndexInBackground,
  captureException,
} from "../helpers";
import { LinkItem, CommonResponse, RagOptions } from "../types";
import * as i18n from "../i18n";
import { resolveNoteFilePath } from "./todos-service";
import {
  cachedFileScan,
  pruneScanKind,
  flushScanCache,
} from "./scan-cache";
import { listVaultFiles } from "./vault-scan";

interface ParsedNoteLinks {
  noteTitle: string;
  links: Array<{ url: string; title: string; lineContext: string }>;
}

const LINK_SCAN_KIND = "links";

function parseLinksFromContent(
  content: string,
  filename: string,
): ParsedNoteLinks {
  let noteTitle = filename.replace(/\.md$/, "");
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch && titleMatch[1].trim()) {
    noteTitle = titleMatch[1].trim();
  }

  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const matches = [...content.matchAll(linkRegex)];
  const lines = content.split("\n");

  const links = matches.map((m) => {
    const fullMatch = m[0];
    const linkText = m[1].trim();
    const url = m[2].trim();

    let lineContext = "";
    for (const line of lines) {
      if (line.includes(fullMatch)) {
        lineContext = line.replace(/#+\s+/, "").trim();
        break;
      }
    }

    return { url, title: linkText || url, lineContext };
  });

  return { noteTitle, links };
}

export async function scanLinksForFile(
  folderName: string,
  filename: string,
): Promise<LinkItem[]> {
  const filePath = resolveNoteFilePath(folderName, filename);
  try {
    const stat = await fs.stat(filePath);
    const parsed = await cachedFileScan<ParsedNoteLinks>(
      LINK_SCAN_KIND,
      filePath,
      stat,
      async () => {
        const content = await fs.readFile(filePath, "utf-8");
        return parseLinksFromContent(content, filename);
      },
    );
    const items = parsed.links.map((link, index) => ({
      id: `note-${folderName}-${filename}-${encodeURIComponent(link.url)}-${index}`,
      url: link.url,
      title: link.title,
      description: "",
      tags: [],
      createdAt: stat.mtimeMs,
      isManual: false,
      folderName,
      filename,
      noteTitle: parsed.noteTitle,
    }));
    return items;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error(`Error extracting links from ${filePath}:`, err);
      captureException(err);
    }
    return [];
  }
}

export async function getLinks(): Promise<LinkItem[]> {
  const repoPath = getRepoPath();
  await ensureDirs();

  const linkItems: LinkItem[] = [];

  const linksJsonPath = path.join(repoPath, "links.json");
  try {
    if (await exists(linksJsonPath)) {
      const content = await fs.readFile(linksJsonPath, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        linkItems.push(
          ...parsed.map((item: any, idx: number) => ({
            ...item,
            id:
              item.id ||
              `manual-${encodeURIComponent(item.url)}-${item.createdAt || idx}`,
            isManual: true,
          })),
        );
      }
    }
  } catch (err) {
    console.error("Error reading links.json:", err);
    captureException(err);
  }

  const { folderFiles, myDayFiles, seenPaths } = await listVaultFiles();

  const tasks: Promise<LinkItem[]>[] = [];
  for (const filename of myDayFiles) {
    tasks.push(scanLinksForFile("myday", filename));
  }
  for (const [folder, files] of folderFiles) {
    for (const filename of files) {
      tasks.push(scanLinksForFile(folder, filename));
    }
  }
  const noteLinkGroups = await Promise.all(tasks);
  for (const group of noteLinkGroups) {
    linkItems.push(...group);
  }

  await pruneScanKind(LINK_SCAN_KIND, seenPaths);
  await flushScanCache();

  return linkItems.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addManualLink({
  url,
  title,
  description,
  tags,
}: {
  url: string;
  title: string;
  description?: string;
  tags?: string[];
}): Promise<{ success: boolean; link?: LinkItem; error?: string }> {
  const repoPath = getRepoPath();
  await ensureDirs();
  const linksJsonPath = path.join(repoPath, "links.json");

  try {
    let links: LinkItem[] = [];
    if (await exists(linksJsonPath)) {
      const content = await fs.readFile(linksJsonPath, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        links = parsed;
      }
    }

    const newLink: LinkItem = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url,
      title,
      description,
      tags: tags || [],
      createdAt: Date.now(),
      isManual: true,
    };

    links.push(newLink);
    await fs.writeFile(linksJsonPath, JSON.stringify(links, null, 2), "utf-8");

    backgroundCommit(`chore(links): add manual link "${title}"`, "links.json");

    if (shouldIndexInBackground()) {
      getEmbeddingService()
        .syncIndex()
        .catch((err) => {
          console.error("Error syncing index after adding link:", err);
        });
    }

    return { success: true, link: newLink };
  } catch (err) {
    console.error("Error adding manual link:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteManualLink(id: string): Promise<CommonResponse> {
  if (!id || typeof id !== "string") {
    return {
      success: false,
      error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_LINK_ID_REQUIRED),
    };
  }

  const repoPath = getRepoPath();
  await ensureDirs();
  const linksJsonPath = path.join(repoPath, "links.json");

  try {
    if (!(await exists(linksJsonPath))) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_LINKS_JSON_NOT_EXIST),
      };
    }

    const content = await fs.readFile(linksJsonPath, "utf-8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_LINKS_JSON_INVALID),
      };
    }

    let deleted = false;
    const updatedLinks = parsed.filter((link: any, idx: number) => {
      const linkId =
        link.id ||
        `manual-${encodeURIComponent(link.url)}-${link.createdAt || idx}`;
      if (!deleted && (link.id === id || linkId === id || link.url === id)) {
        deleted = true;
        return false;
      }
      return true;
    });

    if (!deleted) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_LINK_NOT_FOUND),
      };
    }

    await fs.writeFile(
      linksJsonPath,
      JSON.stringify(updatedLinks, null, 2),
      "utf-8",
    );

    backgroundCommit(`chore(links): delete manual link "${id}"`, "links.json");

    if (shouldIndexInBackground()) {
      getEmbeddingService()
        .syncIndex()
        .catch((err) => {
          console.error("Error syncing index after deleting link:", err);
        });
    }

    return { success: true };
  } catch (err) {
    console.error("Error deleting manual link:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

export async function updateManualLink({
  id,
  url,
  title,
  description,
  tags,
}: {
  id: string;
  url: string;
  title: string;
  description?: string;
  tags?: string[];
}): Promise<CommonResponse> {
  if (!id || typeof id !== "string") {
    return {
      success: false,
      error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_LINK_ID_REQUIRED),
    };
  }

  const repoPath = getRepoPath();
  await ensureDirs();
  const linksJsonPath = path.join(repoPath, "links.json");

  try {
    if (!(await exists(linksJsonPath))) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_LINKS_JSON_NOT_EXIST),
      };
    }

    const content = await fs.readFile(linksJsonPath, "utf-8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_LINKS_JSON_INVALID),
      };
    }

    let updated = false;
    const updatedLinks = parsed.map((link: any, idx: number) => {
      const linkId =
        link.id ||
        `manual-${encodeURIComponent(link.url)}-${link.createdAt || idx}`;
      if (!updated && (link.id === id || linkId === id || link.url === id)) {
        updated = true;
        return {
          ...link,
          id: link.id || linkId,
          url,
          title,
          description,
          tags: tags || [],
        };
      }
      return link;
    });

    if (!updated) {
      return {
        success: false,
        error: i18n.t(i18n.CORE_I18N_KEYS.ERROR_LINK_NOT_FOUND),
      };
    }

    await fs.writeFile(
      linksJsonPath,
      JSON.stringify(updatedLinks, null, 2),
      "utf-8",
    );

    backgroundCommit(
      `chore(links): update manual link "${title}"`,
      "links.json",
    );

    if (shouldIndexInBackground()) {
      getEmbeddingService()
        .syncIndex()
        .catch((err) => {
          console.error("Error syncing index after updating link:", err);
        });
    }

    return { success: true };
  } catch (err) {
    console.error("Error updating manual link:", err);
    captureException(err);
    return { success: false, error: (err as Error).message };
  }
}

