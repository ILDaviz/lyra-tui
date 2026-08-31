import { useMemo } from "react";
import Fuse from "fuse.js";

export function filterWithFuse<T>(
  fuse: Fuse<T> | null,
  items: T[],
  query: string,
): T[] {
  const q = query.trim();
  if (!q || !fuse) return items;
  return fuse.search(q).map((result) => result.item);
}

export function useFuseFilter<T>(
  items: T[],
  keys: string[],
  query: string,
): T[] {
  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys,
        threshold: 0.2,
        ignoreLocation: true,
      }),
    [items, keys],
  );
  return useMemo(
    () => filterWithFuse(fuse, items, query),
    [fuse, items, query],
  );
}
