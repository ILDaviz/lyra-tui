import React, { useState, useEffect, useMemo, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import {
  getGraphService,
  GraphNode,
  VaultGraph,
  getRelativePath,
} from "@lyratui/core";
import { useAppStore } from "../../store";
import { useTranslation } from "../../i18n";
import { useTheme, getScrollbarOptions } from "../../theme";
import { scrollIndexIntoView } from "../../utils/scrollHelper";
import { MarqueeText } from "../MarqueeText";
import { TuiActiveNote } from "../../types";

export interface EditorLocalGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeNote: TuiActiveNote | null;
}

interface TreeNodeItem {
  id: string;
  node: GraphNode;
  level: number;
  prefix: string;
  isLast: boolean;
  parentTitle?: string;
}

export function EditorLocalGraphModal({
  isOpen,
  onClose,
  activeNote,
}: EditorLocalGraphModalProps): any {
  const theme = useTheme();
  const openGraphNode = useAppStore((s) => s.openGraphNode);
  const { t, keys } = useTranslation();

  const [graphData, setGraphData] = useState<VaultGraph | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeColumn, setActiveColumn] = useState<"forward" | "backlinks">(
    "forward",
  );
  const [forwardIdx, setForwardIdx] = useState<number>(0);
  const [backlinkIdx, setBacklinkIdx] = useState<number>(0);

  const forwardScrollRef = useRef<any>(null);
  const backlinkScrollRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen || !activeNote) return;

    let mounted = true;
    setIsLoading(true);
    void (async () => {
      try {
        const graphService = getGraphService();
        const fullGraph = await graphService.buildVaultGraph({ force: true });
        if (mounted) {
          setGraphData(fullGraph);
          setForwardIdx(0);
          setBacklinkIdx(0);
          setActiveColumn("forward");
        }
      } catch (err) {
        console.error("Failed to build local graph for modal:", err);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isOpen, activeNote]);

  const activeNoteId = useMemo(() => {
    if (!activeNote) return "";
    return getRelativePath(activeNote.folderName || "/", activeNote.filename);
  }, [activeNote]);

  const forwardTree = useMemo(() => {
    if (!graphData || !activeNoteId) return [];
    const adj = graphData.adjacency[activeNoteId];
    const hop1Ids = adj?.outgoing || [];
    const items: TreeNodeItem[] = [];

    for (let i = 0; i < hop1Ids.length; i++) {
      const id1 = hop1Ids[i];
      const node1 = graphData.nodes.find((n) => n.id === id1);
      if (!node1) continue;

      const isLastHop1 = i === hop1Ids.length - 1;
      const hop1Prefix = isLastHop1 ? "└── " : "├── ";

      items.push({
        id: `f1-${node1.id}`,
        node: node1,
        level: 1,
        prefix: hop1Prefix,
        isLast: isLastHop1,
      });

      const hop2Ids = (graphData.adjacency[id1]?.outgoing || []).filter(
        (id2) => id2 !== activeNoteId && id2 !== id1,
      );

      for (let j = 0; j < hop2Ids.length; j++) {
        const id2 = hop2Ids[j];
        const node2 = graphData.nodes.find((n) => n.id === id2);
        if (!node2) continue;

        const isLastHop2 = j === hop2Ids.length - 1;
        const subPrefix = isLastHop1 ? "    " : "│   ";
        const hop2Prefix = `${subPrefix}${isLastHop2 ? "└── " : "├── "}`;

        items.push({
          id: `f2-${node1.id}-${node2.id}`,
          node: node2,
          level: 2,
          prefix: hop2Prefix,
          isLast: isLastHop2,
          parentTitle: node1.title,
        });
      }
    }

    return items;
  }, [graphData, activeNoteId]);

  const backlinkTree = useMemo(() => {
    if (!graphData || !activeNoteId) return [];
    const adj = graphData.adjacency[activeNoteId];
    const hop1Ids = adj?.incoming || [];
    const items: TreeNodeItem[] = [];

    for (let i = 0; i < hop1Ids.length; i++) {
      const id1 = hop1Ids[i];
      const node1 = graphData.nodes.find((n) => n.id === id1);
      if (!node1) continue;

      const isLastHop1 = i === hop1Ids.length - 1;
      const hop1Prefix = isLastHop1 ? "└── " : "├── ";

      items.push({
        id: `b1-${node1.id}`,
        node: node1,
        level: 1,
        prefix: hop1Prefix,
        isLast: isLastHop1,
      });

      const hop2Ids = (graphData.adjacency[id1]?.incoming || []).filter(
        (id2) => id2 !== activeNoteId && id2 !== id1,
      );

      for (let j = 0; j < hop2Ids.length; j++) {
        const id2 = hop2Ids[j];
        const node2 = graphData.nodes.find((n) => n.id === id2);
        if (!node2) continue;

        const isLastHop2 = j === hop2Ids.length - 1;
        const subPrefix = isLastHop1 ? "    " : "│   ";
        const hop2Prefix = `${subPrefix}${isLastHop2 ? "└── " : "├── "}`;

        items.push({
          id: `b2-${node1.id}-${node2.id}`,
          node: node2,
          level: 2,
          prefix: hop2Prefix,
          isLast: isLastHop2,
          parentTitle: node1.title,
        });
      }
    }

    return items;
  }, [graphData, activeNoteId]);

  useEffect(() => {
    if (
      activeColumn === "forward" &&
      forwardScrollRef.current &&
      forwardTree.length > 0 &&
      forwardIdx >= 0
    ) {
      scrollIndexIntoView(
        forwardScrollRef.current,
        forwardIdx,
        1,
        forwardTree.length,
        forwardIdx,
      );
    }
  }, [forwardIdx, forwardTree.length, activeColumn]);

  useEffect(() => {
    if (
      activeColumn === "backlinks" &&
      backlinkScrollRef.current &&
      backlinkTree.length > 0 &&
      backlinkIdx >= 0
    ) {
      scrollIndexIntoView(
        backlinkScrollRef.current,
        backlinkIdx,
        1,
        backlinkTree.length,
        backlinkIdx,
      );
    }
  }, [backlinkIdx, backlinkTree.length, activeColumn]);

  useKeyboard((key) => {
    if (!isOpen) return;

    if (key.name === "escape") {
      key.preventDefault?.();
      onClose();
      return;
    }

    if (key.name === "tab" || key.name === "left" || key.name === "right") {
      key.preventDefault?.();
      setActiveColumn((prev) => (prev === "forward" ? "backlinks" : "forward"));
      return;
    }

    if (activeColumn === "forward") {
      if (
        key.name === "up" ||
        key.name === "k" ||
        (key.ctrl && (key.name === "p" || key.name === "k"))
      ) {
        key.preventDefault?.();
        setForwardIdx((prev) =>
          prev > 0 ? prev - 1 : Math.max(0, forwardTree.length - 1),
        );
      } else if (
        key.name === "down" ||
        key.name === "j" ||
        (key.ctrl && (key.name === "n" || key.name === "j"))
      ) {
        key.preventDefault?.();
        setForwardIdx((prev) => (prev < forwardTree.length - 1 ? prev + 1 : 0));
      } else if (key.name === "return") {
        key.preventDefault?.();
        const selected = forwardTree[forwardIdx];
        if (selected) {
          onClose();
          void openGraphNode(selected.node);
        }
      }
    } else {
      if (
        key.name === "up" ||
        key.name === "k" ||
        (key.ctrl && (key.name === "p" || key.name === "k"))
      ) {
        key.preventDefault?.();
        setBacklinkIdx((prev) =>
          prev > 0 ? prev - 1 : Math.max(0, backlinkTree.length - 1),
        );
      } else if (
        key.name === "down" ||
        key.name === "j" ||
        (key.ctrl && (key.name === "n" || key.name === "j"))
      ) {
        key.preventDefault?.();
        setBacklinkIdx((prev) =>
          prev < backlinkTree.length - 1 ? prev + 1 : 0,
        );
      } else if (key.name === "return") {
        key.preventDefault?.();
        const selected = backlinkTree[backlinkIdx];
        if (selected) {
          onClose();
          void openGraphNode(selected.node);
        }
      }
    }
  });

  if (!isOpen || !activeNote) return null;

  return (
    <box
      position="absolute"
      top={2}
      left="10%"
      width="80%"
      height="85%"
      borderStyle="rounded"
      borderColor={theme.accent.secondary}
      flexDirection="column"
      padding={1}
      backgroundColor={theme.bg.panelAlt}
    >
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        marginBottom={1}
      >
        <box flexDirection="row" gap={1} alignItems="center">
          <text fg={theme.accent.primary}>
            {t(keys.EDITOR_LOCAL_GRAPH_TITLE)}
          </text>
          <text fg={theme.text.dim}>•</text>
          <text
            fg={theme.accent.green}
          >{`[[${activeNote.title || activeNote.filename}]]`}</text>
        </box>
        <text fg={theme.text.dim}>{t(keys.EDITOR_LOCAL_GRAPH_CLOSE_HINT)}</text>
      </box>

      <box
        flexDirection="row"
        flexGrow={1}
        gap={2}
        marginBottom={1}
        width="100%"
      >
        <box
          width="50%"
          height="100%"
          borderStyle="rounded"
          borderColor={
            activeColumn === "forward"
              ? theme.border.focus
              : theme.border.subtle
          }
          flexDirection="column"
          padding={1}
          backgroundColor={theme.bg.panel}
        >
          <box
            flexDirection="row"
            justifyContent="space-between"
            marginBottom={1}
          >
            <text
              fg={
                activeColumn === "forward"
                  ? theme.accent.primary
                  : theme.text.muted
              }
            >
              {`┌─ ${t(keys.EDITOR_FORWARD_LINKS_TITLE)} (${
                isLoading ? "…" : forwardTree.length
              }) ─`}
            </text>
            {activeColumn === "forward" && (
              <text fg={theme.accent.primary}>
                {t(keys.EDITOR_LOCAL_GRAPH_ACTIVE_BADGE)}
              </text>
            )}
          </box>

          {isLoading ? (
            <box justifyContent="center" alignItems="center" flexGrow={1}>
              <text fg={theme.accent.primary}>
                {t(keys.EDITOR_LOCAL_GRAPH_LOADING)}
              </text>
            </box>
          ) : forwardTree.length === 0 ? (
            <box justifyContent="center" alignItems="center" flexGrow={1}>
              <text fg={theme.text.dim}>
                {t(keys.EDITOR_LOCAL_GRAPH_NO_FORWARD)}
              </text>
            </box>
          ) : (
            <scrollbox
              ref={forwardScrollRef}
              flexGrow={1}
              scrollY={true}
              scrollX={false}
              verticalScrollbarOptions={getScrollbarOptions(
                theme,
                activeColumn === "forward",
              )}
            >
              {forwardTree.map((item, idx) => {
                const isSelected =
                  activeColumn === "forward" && forwardIdx === idx;
                const isUnresolved = !item.node.exists;
                const prefixLength = item.prefix.length + 4;
                const maxLen = Math.max(14, 30 - prefixLength);

                return (
                  <box
                    key={item.id}
                    flexDirection="row"
                    paddingLeft={1}
                    paddingRight={1}
                    backgroundColor={isSelected ? theme.bg.selected : undefined}
                    alignItems="center"
                    width="100%"
                  >
                    <text fg={theme.text.dim}>{item.prefix}</text>
                    <text
                      fg={isSelected ? theme.accent.primary : theme.text.dim}
                    >
                      [[
                    </text>
                    <MarqueeText
                      text={item.node.title}
                      maxLength={maxLen}
                      isSelected={isSelected}
                      isFocused={activeColumn === "forward"}
                      fg={
                        isSelected
                          ? theme.accent.primary
                          : isUnresolved
                            ? theme.accent.yellow
                            : item.level === 1
                              ? theme.accent.green
                              : theme.accent.cyan
                      }
                    />
                    <text
                      fg={isSelected ? theme.accent.primary : theme.text.dim}
                    >
                      ]]
                    </text>
                    {isUnresolved && (
                      <text fg={theme.accent.yellow}> (⚠️)</text>
                    )}
                  </box>
                );
              })}
            </scrollbox>
          )}
        </box>

        <box
          width="50%"
          height="100%"
          borderStyle="rounded"
          borderColor={
            activeColumn === "backlinks"
              ? theme.border.focus
              : theme.border.subtle
          }
          flexDirection="column"
          padding={1}
          backgroundColor={theme.bg.panel}
        >
          <box
            flexDirection="row"
            justifyContent="space-between"
            marginBottom={1}
          >
            <text
              fg={
                activeColumn === "backlinks"
                  ? theme.accent.primary
                  : theme.text.muted
              }
            >
              {`┌─ ${t(keys.EDITOR_BACKLINKS_TITLE)} (${
                isLoading ? "…" : backlinkTree.length
              }) ─`}
            </text>
            {activeColumn === "backlinks" && (
              <text fg={theme.accent.primary}>
                {t(keys.EDITOR_LOCAL_GRAPH_ACTIVE_BADGE)}
              </text>
            )}
          </box>

          {isLoading ? (
            <box justifyContent="center" alignItems="center" flexGrow={1}>
              <text fg={theme.accent.primary}>
                {t(keys.EDITOR_LOCAL_GRAPH_LOADING)}
              </text>
            </box>
          ) : backlinkTree.length === 0 ? (
            <box justifyContent="center" alignItems="center" flexGrow={1}>
              <text fg={theme.text.dim}>
                {t(keys.EDITOR_LOCAL_GRAPH_NO_BACKLINKS)}
              </text>
            </box>
          ) : (
            <scrollbox
              ref={backlinkScrollRef}
              flexGrow={1}
              scrollY={true}
              scrollX={false}
              verticalScrollbarOptions={getScrollbarOptions(
                theme,
                activeColumn === "backlinks",
              )}
            >
              {backlinkTree.map((item, idx) => {
                const isSelected =
                  activeColumn === "backlinks" && backlinkIdx === idx;
                const isUnresolved = !item.node.exists;
                const prefixLength = item.prefix.length + 4;
                const maxLen = Math.max(14, 30 - prefixLength);

                return (
                  <box
                    key={item.id}
                    flexDirection="row"
                    paddingLeft={1}
                    paddingRight={1}
                    backgroundColor={isSelected ? theme.bg.selected : undefined}
                    alignItems="center"
                    width="100%"
                  >
                    <text fg={theme.text.dim}>{item.prefix}</text>
                    <text
                      fg={isSelected ? theme.accent.primary : theme.text.dim}
                    >
                      [[
                    </text>
                    <MarqueeText
                      text={item.node.title}
                      maxLength={maxLen}
                      isSelected={isSelected}
                      isFocused={activeColumn === "backlinks"}
                      fg={
                        isSelected
                          ? theme.accent.primary
                          : isUnresolved
                            ? theme.accent.yellow
                            : item.level === 1
                              ? theme.accent.green
                              : theme.accent.cyan
                      }
                    />
                    <text
                      fg={isSelected ? theme.accent.primary : theme.text.dim}
                    >
                      ]]
                    </text>
                    {isUnresolved && (
                      <text fg={theme.accent.yellow}> (⚠️)</text>
                    )}
                  </box>
                );
              })}
            </scrollbox>
          )}
        </box>
      </box>

      <box
        flexDirection="row"
        justifyContent="center"
        alignItems="center"
        flexShrink={0}
      >
        <text fg={theme.text.dim}>{t(keys.EDITOR_LOCAL_GRAPH_HINT)}</text>
      </box>
    </box>
  );
}
