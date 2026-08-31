import { describe, it, expect, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { getMyDayPath } from "../src/helpers";
import {
  getMyDayNote,
  writeMyDayNote,
  listMyDayNotes,
} from "../src/services/myday-service";

describe("MyDay Service", () => {
  const testDate = "2026-08-20";

  afterAll(async () => {
    try {
      const p = path.join(getMyDayPath(), `${testDate}.md`);
      await fs.rm(p, { force: true });
    } catch {}
  });

  it("should retrieve or create a new daily log note", async () => {
    const res = await getMyDayNote(testDate);
    expect(res.success).toBe(true);
    expect(res.filename).toBe(`${testDate}.md`);
  });

  it("should write to a daily log note and list it", async () => {
    const writeRes = await writeMyDayNote(testDate, "Logged today goals");
    expect(writeRes.success).toBe(true);

    const list = await listMyDayNotes();
    expect(list.some((m) => m.dateStr === testDate)).toBe(true);
  });
});
