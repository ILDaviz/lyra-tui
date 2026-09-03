import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAppStore } from "../store";
import { useKeyboard, useRenderer } from "@opentui/react";
import { Editor } from "./editor";
import { useTranslation, getLocale } from "../i18n";
import { useTheme } from "../theme";
import { getLocalDateString } from "@lyratui/core";
import { VirtualList } from "./common/VirtualList";
import { ListFilterBar } from "./common/ListFilterBar";
import { useFuseFilter } from "../utils/fuzzy";

const MYDAY_FUSE_KEYS = ["dateStr"];

type MyDayRow =
  | { type: "header"; key: string; label: string; height: number }
  | { type: "date"; key: string; dateStr: string; dateIndex: number };

const MYDAY_HEADER_HEIGHT = 2;

function monthHeaderLabel(dateStr: string, locale: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const label = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function MyDayView(): any {
  const theme = useTheme();
  const renderer = useRenderer();
  const myDayNotes = useAppStore((s) => s.myDayNotes);
  const activeMyDayDate = useAppStore((s) => s.activeMyDayDate);
  const openMyDayDate = useAppStore((s) => s.openMyDayDate);
  const openInExternalEditor = useAppStore((s) => s.openInExternalEditor);
  const activePane = useAppStore((s) => s.activePane);
  const setActivePane = useAppStore((s) => s.setActivePane);
  const isCommandPaletteOpen = useAppStore((s) => s.isCommandPaletteOpen);
  const isHelpOpen = useAppStore((s) => s.isHelpOpen);
  const { t, keys } = useTranslation();
  const isListFocused = activePane === "list";

  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [filterQuery, setFilterQuery] = useState<string>("");
  const [isFilterEditing, setIsFilterEditing] = useState<boolean>(false);

  const todayStr = getLocalDateString();
  const allDates = useMemo(
    () =>
      Array.from(new Set([todayStr, ...myDayNotes.map((m) => m.dateStr)])).sort(
        (a, b) => b.localeCompare(a),
      ),
    [todayStr, myDayNotes],
  );
  const fuseItems = useMemo(
    () => allDates.map((dateStr) => ({ dateStr })),
    [allDates],
  );
  const matchedItems = useFuseFilter(fuseItems, MYDAY_FUSE_KEYS, filterQuery);
  const matchedDates = useMemo(
    () => matchedItems.map((i) => i.dateStr),
    [matchedItems],
  );
  const datesWithContent = useMemo(
    () => new Set(myDayNotes.filter((m) => m.hasContent).map((m) => m.dateStr)),
    [myDayNotes],
  );

  const hasQuery = filterQuery.trim().length > 0;

  const rows = useMemo<MyDayRow[]>(() => {
    const dateRows: MyDayRow[] = matchedDates.map((dateStr, dateIndex) => ({
      type: "date",
      key: dateStr,
      dateStr,
      dateIndex,
    }));
    if (hasQuery) {
      return dateRows;
    }
    const monthCounts = new Map<string, number>();
    for (const dateStr of matchedDates) {
      const month = dateStr.slice(0, 7);
      monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
    }
    const locale = getLocale() === "it" ? "it-IT" : "en-US";
    const result: MyDayRow[] = [];
    let currentMonth = "";
    for (const row of dateRows) {
      if (row.type === "date") {
        const month = row.dateStr.slice(0, 7);
        if (month !== currentMonth) {
          currentMonth = month;
          result.push({
            type: "header",
            key: `header-${month}`,
            label: `${monthHeaderLabel(`${month}-01`, locale)} (${monthCounts.get(month) ?? 0})`,
            height: MYDAY_HEADER_HEIGHT,
          });
        }
      }
      result.push(row);
    }
    return result;
  }, [matchedDates, hasQuery]);

  const getRowHeight = useCallback(
    (row: MyDayRow) =>
      row.type === "header"
        ? MYDAY_HEADER_HEIGHT
        : (row.dateStr === todayStr ? 3 : 1) + 1,
    [todayStr],
  );

  const selectedIndexForRows = useMemo(() => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.type === "date" && row.dateIndex === selectedIndex) return i;
    }
    return 0;
  }, [rows, selectedIndex]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filterQuery]);

  useEffect(() => {
    if (!isListFocused) return;
    if (matchedDates.length === 0) {
      setSelectedIndex(0);
      return;
    }
    const safeIndex = Math.max(
      0,
      Math.min(selectedIndex, matchedDates.length - 1),
    );
    if (safeIndex !== selectedIndex) {
      setSelectedIndex(safeIndex);
    }
  }, [selectedIndex, matchedDates.length, isListFocused]);

  useKeyboard((key) => {
    if (isCommandPaletteOpen || isHelpOpen || !isListFocused) return;

    if (isFilterEditing) {
      if (key.name === "escape") {
        setFilterQuery("");
        setIsFilterEditing(false);
        setSelectedIndex(0);
      } else if (key.name === "return") {
        const d = matchedDates[selectedIndex];
        if (d) {
          openMyDayDate(d);
          setActivePane("editor");
        }
        setIsFilterEditing(false);
      }
      return;
    }

    if (key.name === "/" || key.name === "g") {
      setIsFilterEditing(true);
      return;
    }

    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : matchedDates.length - 1,
      );
    } else if (key.name === "down" || key.name === "j") {
      setSelectedIndex((prev) =>
        prev < matchedDates.length - 1 ? prev + 1 : 0,
      );
    } else if (key.name === "return" || key.name === "space") {
      const d = matchedDates[selectedIndex];
      if (d) {
        openMyDayDate(d);
        if (key.name === "return") setActivePane("editor");
      }
    } else if (
      key.name === "v" ||
      (key.name === "e" && key.ctrl) ||
      (key.name === "e" && key.meta)
    ) {
      const d = matchedDates[selectedIndex];
      if (d) {
        openInExternalEditor(renderer, {
          folderName: "myday",
          filename: `${d}.md`,
        });
      }
    }
  });

  return (
    <box flexGrow={1} height="100%" flexDirection="row" alignItems="stretch">
      <box
        borderStyle="rounded"
        borderColor={isListFocused ? theme.border.focus : theme.border.subtle}
        width={32}
        height="100%"
        flexShrink={0}
        flexDirection="column"
        padding={1}
        backgroundColor={theme.bg.panel}
      >
        <box
          flexDirection="row"
          justifyContent="flex-start"
          alignItems="center"
        >
          <text fg={isListFocused ? theme.accent.primary : theme.text.muted}>
            {filterQuery
              ? `${t(keys.MYDAY_TITLE)} (${matchedDates.length}/${allDates.length})`
              : `${t(keys.MYDAY_TITLE)} (${allDates.length})`}
          </text>
        </box>

        <box height={1} />

        <ListFilterBar
          query={filterQuery}
          onQueryChange={setFilterQuery}
          isActive={isFilterEditing}
          totalCount={allDates.length}
          filteredCount={matchedDates.length}
          theme={theme}
        />

        <VirtualList
          items={rows}
          getItemHeight={getRowHeight}
          selectedIndex={selectedIndexForRows}
          theme={theme}
          isFocused={isListFocused}
          getKey={(row) => row.key}
          renderItem={(row) =>
            row.type === "header" ? (
              <box marginBottom={1} flexShrink={0}>
                <text fg={theme.text.dim}>{row.label}</text>
              </box>
            ) : (
              (() => {
                const dateStr = row.dateStr;
                const isSelected = row.dateIndex === selectedIndex;
                const isActive = activeMyDayDate === dateStr;
                const isToday = dateStr === todayStr;
                const prefix = isSelected ? "▸ " : "  ";
                const hasContent = datesWithContent.has(dateStr);

                if (isToday) {
                  return (
                    <box
                      flexDirection="row"
                      justifyContent="space-between"
                      alignItems="center"
                      width="100%"
                      borderStyle="rounded"
                      borderColor={
                        isSelected ? theme.accent.primary : theme.accent.green
                      }
                      backgroundColor={
                        isSelected ? theme.bg.selected : theme.bg.highlight
                      }
                      paddingLeft={1}
                      paddingRight={1}
                      marginBottom={1}
                    >
                      <box flexDirection="row" alignItems="center" gap={1}>
                        <text
                          fg={
                            isSelected
                              ? theme.accent.primary
                              : theme.accent.green
                          }
                        >
                          {prefix}
                        </text>
                        <text
                          fg={
                            isSelected
                              ? theme.text.highlight
                              : theme.accent.green
                          }
                        >
                          {dateStr}
                        </text>
                        <text
                          fg={
                            isSelected
                              ? theme.accent.primaryLight
                              : theme.accent.green
                          }
                        >
                          {`[${t(keys.MYDAY_TODAY_LABEL).toUpperCase()}]`}
                        </text>
                      </box>

                      {hasContent ? (
                        <text fg={theme.accent.primary}>●</text>
                      ) : null}
                    </box>
                  );
                }

                return (
                  <box
                    flexDirection="row"
                    justifyContent="space-between"
                    alignItems="center"
                    width="100%"
                    paddingLeft={1}
                    paddingRight={1}
                    backgroundColor={isSelected ? theme.bg.selected : undefined}
                    marginBottom={1}
                  >
                    <box flexDirection="row" alignItems="center" gap={1}>
                      <text
                        fg={
                          isSelected
                            ? theme.accent.primary
                            : isActive
                              ? theme.accent.green
                              : theme.text.dim
                        }
                      >
                        {prefix}
                      </text>
                      <text
                        fg={
                          isSelected
                            ? theme.text.highlight
                            : isActive
                              ? theme.text.primary
                              : theme.text.secondary
                        }
                      >
                        {dateStr}
                      </text>
                    </box>

                    {hasContent ? (
                      <text fg={theme.accent.primary}>●</text>
                    ) : null}
                  </box>
                );
              })()
            )
          }
        />
      </box>

      <Editor />
    </box>
  );
}
