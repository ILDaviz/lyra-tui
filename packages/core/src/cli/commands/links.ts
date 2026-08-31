import { Command } from "commander";
import { getLinks, addManualLink } from "../../services/links-service";
import { print, printError } from "../output";

export async function linksListAction(
  options: {
    filter?: string;
    notes?: boolean;
    manual?: boolean;
    json?: boolean;
  } = {},
): Promise<void> {
  const allLinks = await getLinks();

  let filtered = allLinks;
  const filterType = options.notes
    ? "notes"
    : options.manual
      ? "manual"
      : options.filter;

  if (filterType === "notes") {
    filtered = filtered.filter((l) => !l.isManual);
  } else if (filterType === "manual") {
    filtered = filtered.filter((l) => l.isManual);
  }

  if (options.json) {
    print(JSON.stringify(filtered, null, 2));
    return;
  }

  print("\n  \x1b[1;35m✦ Lyra Links & Bookmarks\x1b[0m\n");

  if (filtered.length === 0) {
    print("  \x1b[90mNo links found.\x1b[0m\n");
    return;
  }

  filtered.forEach((link, idx) => {
    const typeBadge = link.isManual
      ? "\x1b[35m[Manual]\x1b[0m"
      : "\x1b[36m[ Note ]\x1b[0m";
    const title = link.title ? `\x1b[1m${link.title}\x1b[0m - ` : "";
    const source = !link.isManual
      ? `\x1b[90m(from ${link.folderName}/${link.filename})\x1b[0m`
      : "";

    print(
      `  ${String(idx + 1).padStart(2, " ")}. ${typeBadge} ${title}\x1b[4m${link.url}\x1b[0m ${source}`,
    );
  });

  print(`\n  \x1b[90mTotal: ${filtered.length} links\x1b[0m\n`);
}

export async function linksAddAction(
  url: string,
  titleParts?: string[] | string,
  options: { desc?: string; dryRun?: boolean } = {},
): Promise<void> {
  if (!url || url.trim().length === 0) {
    printError("\x1b[31mError:\x1b[0m URL cannot be empty.");
    process.exitCode = 1;
    return;
  }

  let finalUrl = url.trim();
  if (!/^https?:\/\//i.test(finalUrl)) {
    finalUrl = `https://${finalUrl}`;
  }
  try {
    const parsed = new URL(finalUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }
  } catch {
    printError(`\x1b[31mError:\x1b[0m Invalid URL: ${url}`);
    process.exitCode = 1;
    return;
  }

  const title = Array.isArray(titleParts)
    ? titleParts.join(" ")
    : typeof titleParts === "string"
      ? titleParts
      : undefined;
  const cleanTitle = title?.trim() || finalUrl;

  if (options.dryRun) {
    print(
      `\n  \x1b[33mDry run:\x1b[0m would save bookmark: ${cleanTitle} (${finalUrl})\n`,
    );
    return;
  }

  const res = await addManualLink({
    url: finalUrl,
    title: cleanTitle,
    description: options.desc?.trim(),
  });

  if (res.success) {
    print(
      `\n  \x1b[32m✔ Link saved to bookmarks:\x1b[0m ${cleanTitle} (${finalUrl})\n`,
    );
  } else {
    printError(`\n  \x1b[31m✖ Error saving link:\x1b[0m ${res.error}\n`);
    process.exitCode = 1;
  }
}

export function registerLinksCommand(program: Command): void {
  const linksCmd = program
    .command("links")
    .alias("link")
    .description("Manage and list bookmarked URLs and references");

  linksCmd
    .command("list", { isDefault: true })
    .description("List all bookmarks and links in the vault")
    .option(
      "--filter <filter>",
      "Filter links source (all|notes|manual)",
      "all",
    )
    .option("--notes", "Show only links extracted from notes")
    .option("--manual", "Show only manually saved bookmarks")
    .option("-j, --json", "Output links list in structured JSON format")
    .action(async (options) => {
      const filter = options.filter.toLowerCase();
      if (!new Set(["all", "notes", "manual"]).has(filter)) {
        throw new Error(
          `Invalid link filter "${options.filter}". Use all, notes, or manual.`,
        );
      }
      if (options.notes && options.manual) {
        throw new Error("Use either --notes or --manual, not both.");
      }
      if (filter !== "all" && (options.notes || options.manual)) {
        throw new Error("Use --filter or --notes/--manual, not both.");
      }
      options.filter = filter;
      await linksListAction(options);
    });

  linksCmd
    .command("add <url> [title...]")
    .description("Save a new link bookmark")
    .option("-d, --desc <desc>", "Optional bookmark description")
    .option(
      "--dry-run",
      "Show the bookmark that would be saved without writing it",
    )
    .action(async (url, titleParts, options) => {
      await linksAddAction(url, titleParts, options);
    });
}
