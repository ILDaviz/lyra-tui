import React, { useEffect, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useBindings } from "@opentui/keymap/react";
import { getEmbeddingService, getLinks } from "@lyratui/core";
import { useAppStore } from "../../store";
import { useTheme } from "../../theme";
import { useTranslation } from "../../i18n";
import { scrollIndexIntoView } from "../../utils/scrollHelper";
import type { PaletteTab, SearchItem, SearchMode } from "./types";
import { usePaletteCommands } from "./usePaletteCommands";
import { PaletteHeader } from "./PaletteHeader";
import { PaletteTabs } from "./PaletteTabs";
import { PaletteInput } from "./PaletteInput";
import { PaletteCommandsList } from "./PaletteCommandsList";

export function CommandPalette(): any {
  const theme = useTheme();
  const { t, keys } = useTranslation();
  const isOpen = useAppStore((state) => state.isCommandPaletteOpen);
  const setOpen = useAppStore((state) => state.setCommandPaletteOpen);
  const setViewMode = useAppStore((state) => state.setViewMode);
  const selectFolder = useAppStore((state) => state.selectFolder);
  const openMyDayDate = useAppStore((state) => state.openMyDayDate);
  const refreshLinks = useAppStore((state) => state.refreshLinks);
  const setSelectedLinkIndex = useAppStore(
    (state) => state.setSelectedLinkIndex,
  );
  const setActivePane = useAppStore((state) => state.setActivePane);
  const openNote = useAppStore((state) => state.openNote);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [noteResults, setNoteResults] = useState<SearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PaletteTab>("commands");
  const [searchMode, setSearchMode] = useState<SearchMode>("text");
  const searchRequestRef = useRef(0);
  const scrollboxRef = useRef<any>(null);
  const inputRef = useRef<any>(null);

  const { visibleResults } = usePaletteCommands({
    query,
    activeTab,
    searchMode,
    noteResults,
    setSelectedIndex,
  });

  const selectNextTab = () => {
    setActiveTab((tab) => (tab === "commands" ? "search" : "commands"));
    setSelectedIndex(0);
  };

  const selectPreviousTab = () => {
    setActiveTab((tab) => (tab === "commands" ? "search" : "commands"));
    setSelectedIndex(0);
  };

  const selectPreviousResult = () => {
    setSelectedIndex((index) =>
      index > 0 ? index - 1 : Math.max(0, visibleResults.length - 1),
    );
  };

  const selectNextResult = () => {
    setSelectedIndex((index) =>
      index < visibleResults.length - 1 ? index + 1 : 0,
    );
  };

  const executeSelectedResult = () => {
    void visibleResults[selectedIndex]?.action();
  };

  // This layer runs before the focused input so palette controls are not consumed by it.
  useBindings(
    () => ({
      priority: 100,
      enabled: isOpen,
      commands: [
        { name: "palette.tab.next", run: selectNextTab },
        { name: "palette.tab.previous", run: selectPreviousTab },
        { name: "palette.result.previous", run: selectPreviousResult },
        { name: "palette.result.next", run: selectNextResult },
        { name: "palette.result.execute", run: executeSelectedResult },
      ],
      bindings: [
        {
          key: "tab, right",
          cmd: "palette.tab.next",
          desc: "Next palette tab",
        },
        {
          key: "shift+tab, left",
          cmd: "palette.tab.previous",
          desc: "Previous palette tab",
        },
        {
          key: "up, ctrl+k, ctrl+p",
          cmd: "palette.result.previous",
          desc: "Previous palette result",
        },
        {
          key: "down, ctrl+j, ctrl+n",
          cmd: "palette.result.next",
          desc: "Next palette result",
        },
        {
          key: "return",
          cmd: "palette.result.execute",
          desc: "Execute palette result",
        },
      ],
    }),
    [isOpen, selectedIndex, visibleResults],
  );

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setNoteResults([]);
      setIsSearching(false);
      setSearchError(null);
      setSelectedIndex(0);
      setActiveTab("commands");
      setSearchMode("text");
      return;
    }

    if (activeTab !== "search") {
      setNoteResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setNoteResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    let active = true;
    const requestId = ++searchRequestRef.current;
    setIsSearching(true);
    setSearchError(null);
    const timer = setTimeout(() => {
      getEmbeddingService()
        .search(trimmedQuery, 8, undefined, searchMode)
        .then((results) => {
          if (!active || requestId !== searchRequestRef.current) return;
          setNoteResults(
            results.map((result: any) => {
              const isLink =
                result.folderName === "links" ||
                result.filename === "links.json" ||
                (typeof result.title === "string" &&
                  result.title.startsWith("Link:"));
              const isMyDay = result.folderName === "myday";
              const category = isLink
                ? t(keys.HEADER_BREADCRUMB_LINKS)
                : isMyDay
                  ? t(keys.HEADER_BREADCRUMB_MYDAY)
                  : `${t(keys.HEADER_BREADCRUMB_NOTES)} / ${result.folderName === "/" ? t(keys.HEADER_BREADCRUMB_ROOT) : result.folderName}`;

              return {
                id: `note:${result.folderName}:${result.filename}:${result.title}`,
                title: result.title || result.filename,
                category,
                description: result.snippet,
                action: async () => {
                  if (isLink) {
                    setViewMode("links");
                    await refreshLinks();
                    const urlMatch = (result.snippet || "").match(
                      /Link URL:\s*(\S+)/i,
                    );
                    const targetUrl = urlMatch ? urlMatch[1] : "";
                    const targetTitle = (result.title || "").replace(
                      /^Link:\s*/i,
                      "",
                    );
                    const links = await getLinks();
                    const index = links.findIndex(
                      (link) =>
                        (targetUrl && link.url === targetUrl) ||
                        (targetTitle &&
                          (link.title === targetTitle ||
                            link.url === targetTitle)),
                    );
                    if (index !== -1) setSelectedLinkIndex(index);
                    setActivePane("list");
                  } else if (isMyDay) {
                    await openMyDayDate(result.filename.replace(/\.md$/, ""));
                    setActivePane("editor");
                  } else {
                    await selectFolder(result.folderName);
                    await openNote(
                      {
                        filename: result.filename,
                        title: result.title || result.filename,
                        snippet: result.snippet || "",
                        updatedAt: Date.now(),
                        createdAt: Date.now(),
                      },
                      result.folderName,
                    );
                    setActivePane("editor");
                  }
                  setOpen(false);
                },
              };
            }),
          );
        })
        .catch((error: any) => {
          console.error("Search failed in CommandPalette:", error);
          if (active && requestId === searchRequestRef.current) {
            setSearchError(error?.message || "Search failed");
          }
        })
        .finally(() => {
          if (active && requestId === searchRequestRef.current)
            setIsSearching(false);
        });
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    activeTab,
    isOpen,
    keys,
    openMyDayDate,
    openNote,
    query,
    refreshLinks,
    searchMode,
    selectFolder,
    setActivePane,
    setOpen,
    setSelectedLinkIndex,
    setViewMode,
    t,
  ]);

  useEffect(() => {
    if (!isOpen || (activeTab === "search" && visibleResults.length === 0))
      return;
    setSelectedIndex((index) =>
      Math.max(0, Math.min(index, visibleResults.length - 1)),
    );
    if (scrollboxRef.current && visibleResults.length > 0) {
      scrollIndexIntoView(
        scrollboxRef.current,
        selectedIndex,
        2,
        visibleResults.length,
        selectedIndex,
      );
    }
  }, [activeTab, isOpen, selectedIndex, visibleResults]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus?.();
  }, [activeTab, isOpen]);

  useKeyboard((key) => {
    if (!isOpen) return;

    if (key.name === "escape") {
      key.preventDefault?.();
      setOpen(false);
      return;
    }

    if (activeTab === "search") {
      if (key.ctrl && (key.name === "t" || key.name === "T")) {
        key.preventDefault?.();
        setSearchMode("text");
        return;
      }
      if (key.ctrl && (key.name === "s" || key.name === "S")) {
        key.preventDefault?.();
        setSearchMode("semantic");
        return;
      }
      if (key.ctrl && (key.name === "h" || key.name === "H")) {
        key.preventDefault?.();
        setSearchMode("hybrid");
        return;
      }
    }
  });

  if (!isOpen) return null;

  return (
    <box
      position="absolute"
      top={2}
      left="10%"
      width="80%"
      height={30}
      borderStyle="rounded"
      borderColor={theme.border.focus}
      flexDirection="column"
      padding={1}
      backgroundColor={theme.bg.panel}
    >
      <PaletteHeader theme={theme} />
      <PaletteTabs
        activeTab={activeTab}
        searchMode={searchMode}
        theme={theme}
      />
      <PaletteInput
        inputRef={inputRef}
        query={query}
        activeTab={activeTab}
        searchMode={searchMode}
        theme={theme}
        onInput={(value) => {
          setQuery(value);
          setSelectedIndex(0);
        }}
      />
      <PaletteCommandsList
        scrollboxRef={scrollboxRef}
        visibleResults={visibleResults}
        selectedIndex={selectedIndex}
        isSearching={isSearching}
        searchError={searchError}
        theme={theme}
      />
    </box>
  );
}
