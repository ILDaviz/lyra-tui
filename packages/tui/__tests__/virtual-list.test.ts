import { describe, it, expect } from "vitest";
import {
  buildOffsets,
  computeScrollRow,
  findFirstVisibleIndex,
} from "../src/components/common/VirtualList";

describe("VirtualList buildOffsets", () => {
  it("builds cumulative offsets with uniform heights", () => {
    const offsets = buildOffsets(5, () => 3);
    expect(offsets).toEqual([0, 3, 6, 9, 12, 15]);
  });

  it("builds cumulative offsets with variable heights", () => {
    const heights = [4, 2, 2, 6];
    const offsets = buildOffsets(heights.length, (i) => heights[i]);
    expect(offsets).toEqual([0, 4, 6, 8, 14]);
  });

  it("enforces a minimum item height of 1", () => {
    const offsets = buildOffsets(3, () => 0);
    expect(offsets).toEqual([0, 1, 2, 3]);
  });
});

describe("VirtualList computeScrollRow", () => {
  const offsets = buildOffsets(100, () => 3); // totalRows = 300
  const VIEW = 30; // 10 items visible

  it("returns 0 when everything fits", () => {
    const small = buildOffsets(5, () => 3);
    expect(computeScrollRow(small, 30, 4, 3)).toBe(0);
  });

  it("keeps selection visible when navigating down", () => {
    // select item 15 (rows 45..48) with window at top -> scroll to 45-30+3=18
    expect(computeScrollRow(offsets, VIEW, 15, 0)).toBe(18);
  });

  it("keeps selection visible when navigating up", () => {
    // window at row 24 (item 8..), select item 2 (rows 6..9) -> scroll to 6
    expect(computeScrollRow(offsets, VIEW, 2, 24)).toBe(6);
  });

  it("does not shift while selection moves inside the window", () => {
    expect(computeScrollRow(offsets, VIEW, 5, 9)).toBe(9);
  });

  it("clamps to maxScroll for the last item", () => {
    expect(computeScrollRow(offsets, VIEW, 99, 0)).toBe(300 - 30);
  });

  it("handles zero items", () => {
    expect(computeScrollRow([0], VIEW, 0, 5)).toBe(0);
  });

  it("handles unmeasured viewport by clamping only", () => {
    expect(computeScrollRow(offsets, 0, 7, 21)).toBe(21);
  });

  it("clamps oversized scroll rows (items removed)", () => {
    const shrunk = buildOffsets(4, () => 3);
    expect(computeScrollRow(shrunk, VIEW, 0, 100)).toBe(0);
  });
});

describe("VirtualList findFirstVisibleIndex", () => {
  const offsets = buildOffsets(100, () => 3);

  it("finds the first item overlapping the scroll row", () => {
    expect(findFirstVisibleIndex(offsets, 0)).toBe(0);
    expect(findFirstVisibleIndex(offsets, 3)).toBe(1);
    expect(findFirstVisibleIndex(offsets, 45)).toBe(15);
    expect(findFirstVisibleIndex(offsets, 47)).toBe(15); // item 15 spans rows 45..48
  });

  it("clamps to the last item when scrolled past the end", () => {
    expect(findFirstVisibleIndex(offsets, 9999)).toBe(99);
  });
});
