import { describe, it, expect } from "vitest";
import {
  addManualLink,
  getLinks,
  updateManualLink,
  deleteManualLink,
} from "../src/services/links-service";

describe("Links Service", () => {
  let createdLinkId = "";

  it("should add a manual link", async () => {
    const res = await addManualLink({
      url: "https://example.com",
      title: "Example Domain",
      description: "Example description",
      tags: ["test", "example"],
    });

    expect(res.success).toBe(true);
    expect(res.link).toBeDefined();
    createdLinkId = res.link!.id;
  });

  it("should list saved links", async () => {
    const links = await getLinks();
    expect(links.some((l) => l.id === createdLinkId)).toBe(true);
  });

  it("should update a manual link", async () => {
    const updateRes = await updateManualLink({
      id: createdLinkId,
      url: "https://example.com/updated",
      title: "Updated Example",
      description: "Updated description",
      tags: ["test"],
    });

    expect(updateRes.success).toBe(true);
  });

  it("should delete a manual link", async () => {
    const deleteRes = await deleteManualLink(createdLinkId);
    expect(deleteRes.success).toBe(true);

    const linksAfter = await getLinks();
    expect(linksAfter.some((l) => l.id === createdLinkId)).toBe(false);
  }, 15000);
});
