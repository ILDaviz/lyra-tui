import React, { useState, useRef, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useRenderer } from "@opentui/react";
import type { MouseEvent as OuiMouseEvent } from "@opentui/core";
import type { Theme } from "../../theme";

const MOUSE_WHEEL_UP = 64;
const MOUSE_WHEEL_DOWN = 65;
const WHEEL_ROWS = 3;
const OVERSCAN_ROWS = 6;

export function buildOffsets(
  itemCount: number,
  getItemHeight: (index: number) => number,
): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < itemCount; i++) {
    offsets.push(offsets[i] + Math.max(1, getItemHeight(i)));
  }
  return offsets;
}

export function computeScrollRow(
  offsets: ArrayLike<number>,
  viewportHeight: number,
  selectedIndex: number,
  prevScrollRow: number,
): number {
  const itemCount = offsets.length - 1;
  if (itemCount <= 0) return 0;
  const totalRows = offsets[itemCount];
  const maxScroll = Math.max(0, totalRows - viewportHeight);
  let top = Math.max(0, Math.min(prevScrollRow, maxScroll));
  if (viewportHeight <= 0) return top;
  const sel = Math.max(0, Math.min(selectedIndex, itemCount - 1));
  const selTop = offsets[sel];
  const selBottom = offsets[sel + 1];
  if (selTop < top) {
    top = selTop;
  } else if (selBottom > top + viewportHeight) {
    top = selBottom - viewportHeight;
  }
  return Math.max(0, Math.min(top, maxScroll));
}

export function findFirstVisibleIndex(
  offsets: ArrayLike<number>,
  scrollRow: number,
): number {
  const lastIndex = Math.max(0, offsets.length - 2);
  let lo = 0;
  let hi = lastIndex;
  let ans = lastIndex;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] > scrollRow) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans;
}

interface VirtualListProps<T> {
  items: T[];
  itemHeight?: number;
  getItemHeight?: (item: T, index: number) => number;
  selectedIndex: number;
  renderItem: (item: T, index: number, isSelected: boolean) => ReactNode;
  getKey: (item: T, index: number) => string;
  theme: Theme;
  isFocused: boolean;
}

export function VirtualList<T>({
  items,
  itemHeight,
  getItemHeight,
  selectedIndex,
  renderItem,
  getKey,
  theme,
  isFocused,
}: VirtualListProps<T>): any {
  const containerRef = useRef<any>(null);
  const rendererInstance = useRenderer();
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollRow, setScrollRow] = useState(0);

  const heightOf = useMemo(
    () =>
      getItemHeight ??
      ((() => itemHeight ?? 1) as (item: T, index: number) => number),
    [getItemHeight, itemHeight],
  );

  const offsets = useMemo(
    () => buildOffsets(items.length, (i) => heightOf(items[i], i)),
    [items, heightOf],
  );
  const totalRows = offsets[items.length] ?? 0;
  const maxScroll = Math.max(0, totalRows - viewportHeight);

  useEffect(() => {
    const el = containerRef.current;
    const MEASURE_INTERVAL_MS = 250;
    let lastMeasuredAt = 0;
    const measure = (force = false) => {
      if (!el) return;
      const now = Date.now();
      if (!force && now - lastMeasuredAt < MEASURE_INTERVAL_MS) return;
      lastMeasuredAt = now;
      const h = typeof el.height === "number" ? el.height : 0;
      if (h > 0) {
        setViewportHeight((prev) => (prev === h ? prev : h));
      }
    };
    measure(true);
    const timer = setTimeout(() => measure(true), 50);
    const renderer = rendererInstance;
    const onFrame = () => measure(false);
    renderer?.on?.("frame", onFrame);
    return () => {
      clearTimeout(timer);
      renderer?.off?.("frame", onFrame);
    };
  }, [rendererInstance]);

  const clampedScrollRow = computeScrollRow(
    offsets,
    viewportHeight,
    selectedIndex,
    scrollRow,
  );

  // Render-phase state adjustment: avoids the extra committed render that an
  // effect-based update would cause on every selection change.
  if (clampedScrollRow !== scrollRow) {
    setScrollRow(clampedScrollRow);
  }

  const handleWheel = (event: OuiMouseEvent) => {
    if (event?.button === MOUSE_WHEEL_UP) {
      setScrollRow((prev) => Math.max(0, prev - WHEEL_ROWS));
    } else if (event?.button === MOUSE_WHEEL_DOWN) {
      setScrollRow((prev) => Math.min(maxScroll, prev + WHEEL_ROWS));
    }
  };

  const start = findFirstVisibleIndex(offsets, clampedScrollRow);
  const endRow = clampedScrollRow + viewportHeight + OVERSCAN_ROWS;
  let end = start;
  while (end < items.length && offsets[end] < endRow) end++;

  const showScrollbar = viewportHeight > 0 && totalRows > viewportHeight;
  const thumbRows = Math.max(
    1,
    Math.round((viewportHeight / totalRows) * viewportHeight),
  );
  const thumbPos = Math.min(
    Math.max(0, viewportHeight - thumbRows),
    Math.round(
      (clampedScrollRow / Math.max(1, totalRows - viewportHeight)) *
        Math.max(0, viewportHeight - thumbRows),
    ),
  );

  return (
    <box
      ref={containerRef}
      flexGrow={1}
      flexDirection="row"
      width="100%"
      overflow="hidden"
      onMouseScroll={handleWheel}
    >
      <box flexDirection="column" flexGrow={1}>
        {visibleItems(items, start, end, getKey, renderItem, selectedIndex)}
      </box>
      {showScrollbar && (
        <box
          width={1}
          flexDirection="column"
          backgroundColor={theme.bg.panelAlt}
          paddingTop={thumbPos}
        >
          <box
            height={thumbRows}
            backgroundColor={
              isFocused ? theme.border.focus : theme.border.strong
            }
          />
        </box>
      )}
    </box>
  );
}

function visibleItems<T>(
  items: T[],
  start: number,
  end: number,
  getKey: (item: T, index: number) => string,
  renderItem: (item: T, index: number, isSelected: boolean) => ReactNode,
  selectedIndex: number,
): ReactNode {
  const nodes: ReactNode[] = [];
  for (let index = start; index < end; index++) {
    const item = items[index];
    nodes.push(
      <box key={getKey(item, index)} flexShrink={0} flexDirection="column">
        {renderItem(item, index, index === selectedIndex)}
      </box>,
    );
  }
  return nodes;
}
