export interface ScrollItemOffset {
  top: number;
  height: number;
}

export function scrollIndexIntoView(
  scrollbox: any,
  itemOffset: number | ScrollItemOffset,
  itemHeight = 3,
  totalItems?: number,
  index?: number,
  paddingRows = 1,
): void {
  if (!scrollbox) return;

  const top =
    typeof itemOffset === "number" ? itemOffset * itemHeight : itemOffset.top;
  const height =
    typeof itemOffset === "number" ? itemHeight : itemOffset.height;

  const viewportHeight =
    (scrollbox.viewport?.height && scrollbox.viewport.height > 0
      ? scrollbox.viewport.height
      : null) ||
    (scrollbox.viewport?.heightValue && scrollbox.viewport.heightValue > 0
      ? scrollbox.viewport.heightValue
      : null) ||
    (scrollbox.height && scrollbox.height > 0 ? scrollbox.height : null) ||
    (scrollbox.heightValue && scrollbox.heightValue > 0
      ? scrollbox.heightValue
      : null) ||
    16;

  const currentScrollTop =
    typeof scrollbox.scrollTop === "number" ? scrollbox.scrollTop : 0;

  if (index === 0) {
    try {
      if (typeof scrollbox.scrollTo === "function") {
        scrollbox.scrollTo({ y: 0, x: 0 });
      }
      scrollbox.scrollTop = 0;
    } catch (err) {
      console.error("Failed to scroll to top in scrollIndexIntoView:", err);
    }
    return;
  }

  if (
    totalItems !== undefined &&
    index !== undefined &&
    index >= totalItems - 1 &&
    totalItems > 0
  ) {
    try {
      if (typeof scrollbox.scrollTo === "function") {
        scrollbox.scrollTo({ y: 99999, x: 0 });
      }
      scrollbox.scrollTop = 99999;
    } catch (err) {
      console.error("Failed to scroll to bottom in scrollIndexIntoView:", err);
    }
    return;
  }

  let targetScrollTop = currentScrollTop;

  if (top - paddingRows < currentScrollTop) {
    targetScrollTop = Math.max(0, top - paddingRows);
  } else if (top + height + paddingRows > currentScrollTop + viewportHeight) {
    targetScrollTop = Math.max(0, top + height + paddingRows - viewportHeight);
  }

  if (targetScrollTop !== currentScrollTop) {
    try {
      if (typeof scrollbox.scrollTo === "function") {
        scrollbox.scrollTo({ y: targetScrollTop, x: 0 });
      }
      scrollbox.scrollTop = targetScrollTop;
    } catch (err) {
      console.error(
        "Failed to scroll to target position in scrollIndexIntoView:",
        err,
      );
    }
  }
}
