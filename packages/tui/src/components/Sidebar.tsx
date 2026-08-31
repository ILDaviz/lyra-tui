import React, { useState, useRef, useEffect, useMemo } from "react";
import { useAppStore } from "../store";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "../i18n";
import { useTheme, getScrollbarOptions } from "../theme";
import { scrollIndexIntoView } from "../utils/scrollHelper";
import { MarqueeText } from "./MarqueeText";
import { getLocalDateString } from "@lyratui/core";

export function Sidebar(): any {
  const theme = useTheme();
  const folders = useAppStore((s) => s.folders);
  const activeFolder = useAppStore((s) => s.activeFolder);
  const selectFolder = useAppStore((s) => s.selectFolder);
  const openFolderModal = useAppStore((s) => s.openFolderModal);
  const folderModalType = useAppStore((s) => s.folderModal.type);
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const activePane = useAppStore((s) => s.activePane);
  const setActivePane = useAppStore((s) => s.setActivePane);
  const openMyDayDate = useAppStore((s) => s.openMyDayDate);
  const refreshTodos = useAppStore((s) => s.refreshTodos);
  const refreshLinks = useAppStore((s) => s.refreshLinks);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const isCommandPaletteOpen = useAppStore((s) => s.isCommandPaletteOpen);
  const isHelpOpen = useAppStore((s) => s.isHelpOpen);
  const { t, keys } = useTranslation();

  const isFocused = activePane === "sidebar";
  const scrollboxRef = useRef<any>(null);

  const viewItems = useMemo(
    () => [
      {
        id: "view:myday",
        label: t(keys.SIDEBAR_VIEW_MYDAY),
        mode: "myday" as const,
      },
      {
        id: "view:todos",
        label: t(keys.SIDEBAR_VIEW_TODOS),
        mode: "todos" as const,
      },
      {
        id: "view:links",
        label: t(keys.SIDEBAR_VIEW_LINKS),
        mode: "links" as const,
      },
    ],
    [t, keys],
  );

  const allItems = useMemo(
    () => [
      ...viewItems,
      ...folders.map((f) => ({
        id: `folder:${f}`,
        label: `${f === "/" ? t(keys.HEADER_BREADCRUMB_ROOT) : f}`,
        folder: f,
      })),
      {
        id: "action:new_folder",
        label: t(keys.SIDEBAR_NEW_FOLDER_ACTION),
        isAction: true,
      },
    ],
    [folders, viewItems, t, keys],
  );

  const initialIndex = useMemo(() => {
    let targetId = "";
    if (viewMode === "notes") {
      targetId = `folder:${activeFolder}`;
    } else {
      targetId = `view:${viewMode}`;
    }
    const idx = allItems.findIndex((item) => item.id === targetId);
    return idx !== -1 ? idx : 0;
  }, []);

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const lastStateRef = useRef({ viewMode, activeFolder });

  useEffect(() => {
    if (
      lastStateRef.current.viewMode !== viewMode ||
      lastStateRef.current.activeFolder !== activeFolder
    ) {
      lastStateRef.current = { viewMode, activeFolder };
      let targetId = "";
      if (viewMode === "notes") {
        targetId = `folder:${activeFolder}`;
      } else {
        targetId = `view:${viewMode}`;
      }
      const idx = allItems.findIndex((item) => item.id === targetId);
      if (idx !== -1) {
        setSelectedIndex(idx);
      }
    }
  }, [viewMode, activeFolder, allItems]);

  useEffect(() => {
    if (scrollboxRef.current && allItems.length > 0 && selectedIndex >= 0) {
      scrollIndexIntoView(
        scrollboxRef.current,
        selectedIndex,
        1,
        allItems.length,
        selectedIndex,
      );
    }
  }, [selectedIndex, allItems]);

  useKeyboard(async (key) => {
    if (isCommandPaletteOpen || isHelpOpen || !isFocused || folderModalType)
      return;

    const isNewFolderKey =
      key.name === "n" ||
      (key.name === "f" && key.ctrl) ||
      key.sequence === "\x06" ||
      key.raw === "\x06" ||
      key.name === "ctrl+f";

    if (isNewFolderKey) {
      openFolderModal("create");
      return;
    }

    const currentItem = allItems[selectedIndex];

    if (key.name === "r" || key.name === "f2") {
      if (
        currentItem &&
        "folder" in currentItem &&
        currentItem.folder !== undefined
      ) {
        if (
          currentItem.folder === "/" ||
          currentItem.folder.toLowerCase() === "root"
        ) {
          setStatusMessage(t(keys.SIDEBAR_CANNOT_RENAME_ROOT));
        } else {
          openFolderModal("rename", currentItem.folder);
        }
      }
      return;
    }

    if (key.name === "d" || key.name === "delete" || key.name === "backspace") {
      if (
        currentItem &&
        "folder" in currentItem &&
        currentItem.folder !== undefined
      ) {
        if (
          currentItem.folder === "/" ||
          currentItem.folder.toLowerCase() === "root"
        ) {
          setStatusMessage(t(keys.SIDEBAR_CANNOT_DELETE_ROOT));
        } else {
          openFolderModal("delete", currentItem.folder);
        }
      }
      return;
    }

    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allItems.length - 1));
    } else if (key.name === "down" || key.name === "j") {
      setSelectedIndex((prev) => (prev < allItems.length - 1 ? prev + 1 : 0));
    } else if (key.name === "return" || key.name === "space") {
      if (currentItem) {
        if ("isAction" in currentItem && currentItem.isAction) {
          openFolderModal("create");
        } else if (
          "folder" in currentItem &&
          currentItem.folder !== undefined
        ) {
          selectFolder(currentItem.folder);
          setActivePane("list");
        } else if ("mode" in currentItem && currentItem.mode) {
          setViewMode(currentItem.mode);
          if (currentItem.mode === "myday") {
            const today = getLocalDateString();
            openMyDayDate(today);
          } else if (currentItem.mode === "todos") {
            refreshTodos();
          } else if (currentItem.mode === "links") {
            refreshLinks();
          }
          setActivePane("list");
        }
      }
    }
  });

  return (
    <box
      borderStyle="rounded"
      borderColor={isFocused ? theme.border.focus : theme.border.subtle}
      width={26}
      height="100%"
      flexShrink={0}
      flexDirection="column"
      padding={1}
      backgroundColor={theme.bg.panel}
    >
      <box flexDirection="row" justifyContent="flex-start" alignItems="center">
        <text fg={isFocused ? theme.accent.primary : theme.text.muted}>
          {t(keys.SIDEBAR_TITLE)}
        </text>
      </box>

      <box height={1} />

      <scrollbox
        ref={scrollboxRef}
        flexGrow={1}
        scrollY={true}
        scrollX={false}
        verticalScrollbarOptions={getScrollbarOptions(theme, isFocused)}
      >
        <text fg={theme.text.dim}>{t(keys.SIDEBAR_VIEWS_HEADER)}</text>

        {viewItems.map((v, vIdx) => {
          const itemIdx = vIdx;
          const isSelected = selectedIndex === itemIdx;
          const isActive = viewMode === v.mode;
          const prefix = isSelected ? "▸ " : "  ";

          return (
            <box
              key={v.id}
              id={`sidebar-item-${v.id}`}
              flexDirection="row"
              gap={1}
              width="100%"
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={isSelected ? theme.bg.selected : undefined}
            >
              <text
                fg={
                  isSelected
                    ? theme.accent.primary
                    : isActive
                      ? theme.accent.green
                      : theme.text.secondary
                }
              >
                {`${prefix}${v.label}`}
              </text>
            </box>
          );
        })}

        <box height={1} />

        <box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <text fg={theme.text.dim}>{t(keys.SIDEBAR_FOLDERS_HEADER)}</text>
          <text fg={isFocused ? theme.accent.primary : theme.text.dim}>
            {t(keys.SIDEBAR_NEW_FOLDER_BADGE)}
          </text>
        </box>

        {folders.map((f, idx) => {
          const isSelected = selectedIndex === viewItems.length + idx;
          const isActive = viewMode === "notes" && activeFolder === f;
          const rawName = f === "/" ? t(keys.HEADER_BREADCRUMB_ROOT) : f;
          const prefix = isSelected ? "▸ " : "  ";

          return (
            <box
              key={f}
              id={`sidebar-item-folder:${f}`}
              flexDirection="row"
              width="100%"
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={isSelected ? theme.bg.selected : undefined}
            >
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
              <MarqueeText
                text={rawName}
                maxLength={16}
                isSelected={isSelected}
                isFocused={isFocused}
                fg={
                  isSelected
                    ? theme.accent.primary
                    : isActive
                      ? theme.accent.green
                      : theme.text.secondary
                }
              />
            </box>
          );
        })}

        {(() => {
          const newFolderIdx = viewItems.length + folders.length;
          const isSelected = selectedIndex === newFolderIdx;
          const prefix = isSelected ? "▸ " : "  ";
          return (
            <box
              key="action:new_folder"
              id="sidebar-item-action:new_folder"
              flexDirection="row"
              gap={1}
              width="100%"
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={isSelected ? theme.bg.selected : undefined}
            >
              <text fg={isSelected ? theme.accent.primary : theme.text.dim}>
                {`${prefix}${t(keys.SIDEBAR_NEW_FOLDER_ACTION)}`}
              </text>
            </box>
          );
        })()}
      </scrollbox>
    </box>
  );
}
