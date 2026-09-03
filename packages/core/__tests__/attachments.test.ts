import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import {
  copyFileAttachment,
  resolveAttachmentPath,
  extractAttachments,
  normalizeDroppedPath,
  getAttachmentsDir,
} from "../src/services/notes-service";
import { getRepoPath } from "../src/helpers";

describe("Attachments", () => {
  const repoPath = getRepoPath();
  const sourceDir = path.join(repoPath, "attachments-src-test");

  beforeAll(async () => {
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.rm(getAttachmentsDir(), { recursive: true, force: true });
  });

  afterAll(async () => {
    await fs.rm(sourceDir, { recursive: true, force: true });
  });

  describe("normalizeDroppedPath", () => {
    it("should keep plain absolute paths untouched", () => {
      expect(normalizeDroppedPath("/tmp/report.pdf")).toBe("/tmp/report.pdf");
    });

    it("should trim surrounding whitespace", () => {
      expect(normalizeDroppedPath("  /tmp/report.pdf  ")).toBe(
        "/tmp/report.pdf",
      );
    });

    it("should strip surrounding quotes", () => {
      expect(normalizeDroppedPath('"/tmp/my file.pdf"')).toBe(
        "/tmp/my file.pdf",
      );
      expect(normalizeDroppedPath("'/tmp/my file.pdf'")).toBe(
        "/tmp/my file.pdf",
      );
    });

    it("should strip file:// scheme and decode percent-encoding", () => {
      expect(normalizeDroppedPath("file:///tmp/my%20file.pdf")).toBe(
        "/tmp/my file.pdf",
      );
    });

    it("should decode percent-encoded plain paths", () => {
      expect(normalizeDroppedPath("/tmp/my%20file.pdf")).toBe(
        "/tmp/my file.pdf",
      );
    });

    it("should survive a literal percent sign", () => {
      expect(normalizeDroppedPath("/tmp/100%.pdf")).toBe("/tmp/100%.pdf");
    });

    it("should unescape backslash-escaped spaces from terminal drag and drop", () => {
      expect(normalizeDroppedPath("/tmp/my\\ file.pdf")).toBe(
        "/tmp/my file.pdf",
      );
    });
  });

  describe("extractAttachments", () => {
    it("should extract vault-relative attachment markdown links", () => {
      const md =
        "See [report](attachments/report.pdf) and [photo](attachments/img%20one.png).";
      expect(extractAttachments(md)).toEqual([
        "attachments/report.pdf",
        "attachments/img one.png",
      ]);
    });

    it("should extract angle-bracket links and wikilink attachments", () => {
      const md =
        "![x](<attachments/a b.pdf>) and [[attachments/doc.pdf]] and [[attachments/other.zip|label]]";
      expect(extractAttachments(md)).toEqual([
        "attachments/a b.pdf",
        "attachments/doc.pdf",
        "attachments/other.zip",
      ]);
    });

    it("should ignore external links and duplicates", () => {
      const md =
        "[web](https://example.com) [dup](attachments/x.pdf) [dup](attachments/x.pdf)";
      expect(extractAttachments(md)).toEqual(["attachments/x.pdf"]);
    });

    it("should return an empty array for content without attachments", () => {
      expect(extractAttachments("# Title\n\nJust text.")).toEqual([]);
    });
  });

  describe("copyFileAttachment", () => {
    it("should copy a file into vault attachments and return a relative url", async () => {
      const src = path.join(sourceDir, "file.pdf");
      await fs.writeFile(src, "dummy");

      const result = await copyFileAttachment(src);

      expect(result.success).toBe(true);
      expect(result.url).toBe("attachments/file.pdf");
      expect(result.filename).toBe("file.pdf");

      const copied = await fs.readFile(
        path.join(getAttachmentsDir(), "file.pdf"),
        "utf-8",
      );
      expect(copied).toBe("dummy");
    });

    it("should deduplicate filenames with a numeric suffix", async () => {
      const src = path.join(sourceDir, "file.pdf");
      await fs.writeFile(src, "dummy2");

      const result = await copyFileAttachment(src);

      expect(result.success).toBe(true);
      expect(result.filename).toBe("file-1.pdf");
      expect(result.url).toBe("attachments/file-1.pdf");
    });

    it("should fail for a nonexistent source file", async () => {
      const result = await copyFileAttachment(
        path.join(sourceDir, "missing.pdf"),
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("resolveAttachmentPath", () => {
    beforeAll(async () => {
      await fs.mkdir(getAttachmentsDir(), { recursive: true });
      await fs.writeFile(path.join(getAttachmentsDir(), "file.pdf"), "dummy");
      await fs.writeFile(
        path.join(getAttachmentsDir(), "with space.pdf"),
        "dummy",
      );
    });

    it("should resolve an attachment url to an existing absolute path inside the vault", async () => {
      const resolved = await resolveAttachmentPath("attachments/file.pdf");
      expect(resolved).toBe(path.join(getAttachmentsDir(), "file.pdf"));
    });

    it("should resolve percent-encoded attachment urls", async () => {
      const resolved = await resolveAttachmentPath(
        "attachments/with%20space.pdf",
      );
      expect(resolved).toBe(path.join(getAttachmentsDir(), "with space.pdf"));
    });

    it("should reject paths outside attachments", async () => {
      expect(await resolveAttachmentPath("myday/2026-01-01.md")).toBeNull();
      expect(
        await resolveAttachmentPath("https://example.com/x.pdf"),
      ).toBeNull();
    });

    it("should reject traversal and missing files", async () => {
      expect(
        await resolveAttachmentPath("attachments/../secret.txt"),
      ).toBeNull();
      expect(await resolveAttachmentPath("attachments/missing.pdf")).toBeNull();
    });
  });
});
