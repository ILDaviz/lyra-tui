import React, { useState, useEffect, useMemo } from "react";
import { useAppStore } from "../../store";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { spawn } from "child_process";
import { useTranslation } from "../../i18n";
import { useTheme } from "../../theme";
import { VirtualList } from "../common/VirtualList";
import { ListFilterBar } from "../common/ListFilterBar";
import { useFuseFilter } from "../../utils/fuzzy";
import { LinkFilter } from "./types";
import { LinkHeader } from "./LinkHeader";
import { LinkFilterTabs } from "./LinkFilterTabs";
import { LinkItemCard } from "./LinkItemCard";
import { LinkDeleteModal } from "./LinkDeleteModal";
import { LinkItem } from "@lyratui/core";

type LinkRow =
  | { type: "header"; key: string; label: string; height: number }
  | { type: "link"; key: string; link: LinkItem; flatIndex: number };

const LINK_CARD_HEIGHT = 3;
const LINK_FUSE_KEYS = ["title", "url", "noteTitle", "tags"];

export function LinksView(): any {
  const theme = useTheme();
  const links = useAppStore((s) => s.links);
  const selectedLinkIndex = useAppStore((s) => s.selectedLinkIndex);
  const setSelectedLinkIndex = useAppStore((s) => s.setSelectedLinkIndex);
  const activePane = useAppStore((s) => s.activePane);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const refreshLinks = useAppStore((s) => s.refreshLinks);
  const openLinkSource = useAppStore((s) => s.openLinkSource);
  const deleteLinkAction = useAppStore((s) => s.deleteLinkAction);
  const linkModalOpen = useAppStore((s) => s.linkModalOpen);
  const setLinkModalOpen = useAppStore((s) => s.setLinkModalOpen);
  const isCommandPaletteOpen = useAppStore((s) => s.isCommandPaletteOpen);
  const isHelpOpen = useAppStore((s) => s.isHelpOpen);
  const { t, keys } = useTranslation();
  const isFocused = activePane === "list";
  const { width: termWidth } = useTerminalDimensions();

  const [filter, setFilter] = useState<LinkFilter>("all");
  const [linkToDelete, setLinkToDelete] = useState<LinkItem | null>(null);
  const [filterQuery, setFilterQuery] = useState<string>("");
  const [isFilterEditing, setIsFilterEditing] = useState<boolean>(false);

  const fuseLinks = useFuseFilter(links, LINK_FUSE_KEYS, filterQuery);

  const noteLinks = useMemo(
    () => fuseLinks.filter((l) => !l.isManual && l.folderName !== "myday"),
    [fuseLinks],
  );
  const myDayLinks = useMemo(
    () => fuseLinks.filter((l) => !l.isManual && l.folderName === "myday"),
    [fuseLinks],
  );
  const manualLinks = useMemo(
    () => fuseLinks.filter((l) => l.isManual),
    [fuseLinks],
  );

  const filteredLinks = useMemo(() => {
    if (filter === "manual") {
      return manualLinks;
    }
    if (filter === "notes") {
      return noteLinks;
    }
    if (filter === "myday") {
      return myDayLinks;
    }
    return [...manualLinks, ...noteLinks, ...myDayLinks];
  }, [filter, manualLinks, noteLinks, myDayLinks]);

  const hasQuery = filterQuery.trim().length > 0;

  const rows = useMemo<LinkRow[]>(() => {
    if (filter !== "all" || hasQuery) {
      return filteredLinks.map((link, flatIndex) => ({
        type: "link",
        key: link.id,
        link,
        flatIndex,
      }));
    }
    const result: LinkRow[] = [];
    let flatIndex = 0;
    if (manualLinks.length > 0) {
      result.push({
        type: "header",
        key: "header-manual",
        label: `${t(keys.LINKS_SECTION_MANUAL)} (${manualLinks.length})`,
        height: 2,
      });
      for (const link of manualLinks) {
        result.push({
          type: "link",
          key: link.id,
          link,
          flatIndex: flatIndex++,
        });
      }
    }
    if (noteLinks.length > 0) {
      result.push({
        type: "header",
        key: "header-notes",
        label: `${t(keys.LINKS_SECTION_NOTES)} (${noteLinks.length})`,
        height: 3,
      });
      for (const link of noteLinks) {
        result.push({
          type: "link",
          key: link.id,
          link,
          flatIndex: flatIndex++,
        });
      }
    }
    if (myDayLinks.length > 0) {
      result.push({
        type: "header",
        key: "header-myday",
        label: `${t(keys.LINKS_SECTION_MYDAY)} (${myDayLinks.length})`,
        height: 3,
      });
      for (const link of myDayLinks) {
        result.push({
          type: "link",
          key: link.id,
          link,
          flatIndex: flatIndex++,
        });
      }
    }
    return result;
  }, [filter, hasQuery, filteredLinks, manualLinks, noteLinks, myDayLinks, t, keys]);

  const getRowHeight = useMemo(
    () => (row: LinkRow) =>
      row.type === "header" ? row.height : LINK_CARD_HEIGHT,
    [],
  );

  const selectedIndexForRows = useMemo(() => {
    let seen = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].type === "link") {
        seen++;
        if (seen === selectedLinkIndex) return i;
      }
    }
    return 0;
  }, [rows, selectedLinkIndex]);

  const openUrl = (url: string) => {
    try {
      const command =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "explorer"
            : "xdg-open";
      const child = spawn(command, [url], { detached: true, stdio: "ignore" });
      child.unref();
      setStatusMessage(t(keys.LINKS_OPENED_URL, { url }));
    } catch (err: any) {
      console.error("Failed to open URL in browser:", err);
      setStatusMessage(t(keys.LINKS_OPEN_FAILED, { error: err.message }));
    }
  };

  useEffect(() => {
    setSelectedLinkIndex(0);
  }, [filterQuery, setSelectedLinkIndex]);

  useEffect(() => {
    if (!isFocused) return;
    if (filteredLinks.length === 0) {
      setSelectedLinkIndex(0);
      return;
    }
    const safeIndex = Math.max(
      0,
      Math.min(selectedLinkIndex, filteredLinks.length - 1),
    );
    if (safeIndex !== selectedLinkIndex) {
      setSelectedLinkIndex(safeIndex);
    }
  }, [selectedLinkIndex, filteredLinks.length, filter, isFocused]);

  useKeyboard((key) => {
    if (
      isCommandPaletteOpen ||
      isHelpOpen ||
      linkModalOpen ||
      linkToDelete ||
      !isFocused
    )
      return;

    if (isFilterEditing) {
      if (key.name === "escape") {
        setFilterQuery("");
        setIsFilterEditing(false);
        setSelectedLinkIndex(0);
      } else if (key.name === "return") {
        setIsFilterEditing(false);
      }
      return;
    }

    if (key.name === "/") {
      setIsFilterEditing(true);
      return;
    }

    if (key.name === "up" || key.name === "k") {
      if (filteredLinks.length === 0) return;
      setSelectedLinkIndex((prev) =>
        prev > 0 ? prev - 1 : filteredLinks.length - 1,
      );
    } else if (key.name === "down" || key.name === "j") {
      if (filteredLinks.length === 0) return;
      setSelectedLinkIndex((prev) =>
        prev < filteredLinks.length - 1 ? prev + 1 : 0,
      );
    } else if (key.name === "t" || key.name === "f") {
      setFilter((prev) =>
        prev === "manual"
          ? "notes"
          : prev === "notes"
            ? "myday"
            : prev === "myday"
              ? "all"
              : "manual",
      );
      setSelectedLinkIndex(0);
    } else if (key.name === "1" || key.name === "m") {
      setFilter("manual");
      setSelectedLinkIndex(0);
    } else if (key.name === "2" || key.name === "n") {
      setFilter("notes");
      setSelectedLinkIndex(0);
    } else if (key.name === "3" || key.name === "y") {
      setFilter("myday");
      setSelectedLinkIndex(0);
    } else if (key.name === "4") {
      setFilter("all");
      setSelectedLinkIndex(0);
    } else if (key.name === "return") {
      const link = filteredLinks[selectedLinkIndex];
      if (link) {
        openUrl(link.url);
      }
    } else if (key.name === "a") {
      setLinkModalOpen(true);
    } else if (
      key.name === "d" ||
      key.name === "delete" ||
      key.name === "backspace" ||
      key.name === "x"
    ) {
      const link = filteredLinks[selectedLinkIndex];
      if (link) {
        if (link.isManual) {
          setLinkToDelete(link);
        } else {
          setStatusMessage(t(keys.LINKS_CANNOT_DELETE_NON_MANUAL));
        }
      }
    } else if (key.name === "g") {
      const link = filteredLinks[selectedLinkIndex];
      if (link) {
        openLinkSource(link);
      }
    } else if (key.name === "r" && key.ctrl) {
      refreshLinks();
    }
  });

  return (
    <box
      borderStyle="rounded"
      borderColor={isFocused ? theme.border.focus : theme.border.subtle}
      flexGrow={1}
      flexShrink={1}
      height="100%"
      flexDirection="column"
      padding={1}
      backgroundColor={theme.bg.panel}
    >
      <LinkHeader
        theme={theme}
        totalCount={links.length}
        isFocused={isFocused}
      />

      <LinkFilterTabs
        filter={filter}
        manualCount={manualLinks.length}
        noteCount={noteLinks.length}
        myDayCount={myDayLinks.length}
        totalCount={fuseLinks.length}
        theme={theme}
      />

      <ListFilterBar
        query={filterQuery}
        onQueryChange={setFilterQuery}
        isActive={isFilterEditing}
        totalCount={links.length}
        filteredCount={filteredLinks.length}
        theme={theme}
      />

      {filteredLinks.length === 0 ? (
        <box
          justifyContent="center"
          alignItems="center"
          flexGrow={1}
          flexDirection="column"
          gap={1}
        >
          <text fg={theme.text.muted}>{t(keys.LINKS_EMPTY)}</text>
          <text fg={theme.text.faint}>{t(keys.LINKS_EMPTY_HINT)}</text>
        </box>
      ) : (
        <VirtualList
          items={rows}
          getItemHeight={getRowHeight}
          selectedIndex={selectedIndexForRows}
          theme={theme}
          isFocused={isFocused}
          getKey={(row) => row.key}
          renderItem={(row) =>
            row.type === "header" ? (
              <box
                marginTop={row.height === 3 ? 1 : 0}
                marginBottom={1}
                flexShrink={0}
              >
                <text fg={theme.text.dim}>{row.label}</text>
              </box>
            ) : (
              <LinkItemCard
                link={row.link}
                isSelected={row.flatIndex === selectedLinkIndex}
                theme={theme}
                termWidth={termWidth}
              />
            )
          }
        />
      )}

      <LinkDeleteModal
        isOpen={!!linkToDelete}
        link={linkToDelete}
        onConfirm={async () => {
          if (linkToDelete) {
            await deleteLinkAction(linkToDelete.id);
            setLinkToDelete(null);
          }
        }}
        onClose={() => setLinkToDelete(null)}
      />
    </box>
  );
}
