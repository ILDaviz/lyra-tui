import { describe, expect, it } from "vitest";
import { scrollIndexIntoView } from "../src/utils/scrollHelper";

describe("scrollIndexIntoView", () => {
  it("scrolls variable-height items into the viewport", () => {
    const scrollbox = {
      viewport: { height: 5 },
      scrollTop: 0,
      scrollTo: ({ y }: { y: number }) => {
        scrollbox.scrollTop = y;
      },
    };

    scrollIndexIntoView(scrollbox, { top: 5, height: 3 }, 4, 3, 1);

    expect(scrollbox.scrollTop).toBe(4);
  });
});
