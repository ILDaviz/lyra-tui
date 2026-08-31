import React, { useState, useEffect, useMemo, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import { useBindings } from "@opentui/keymap/react";
import { getGraphService, GraphNode } from "@lyratui/core";
import { useTranslation } from "../../i18n";
import { useTheme, getScrollbarOptions } from "../../theme";
import { scrollIndexIntoView } from "../../utils/scrollHelper";
import { MarqueeText } from "../MarqueeText";

export interface EditorWikilinkPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertWikilink: (linkText: string) => void;
}

interface WikilinkItem {
  id: string;
  title: string;
  folderName: string;
  filename: string;
  isNew?: boolean;
  aliases?: string[];
  tags?: string[];
}

export function EditorWikilinkPickerModal({
  isOpen,
  onClose,
  onInsertWikilink,
}: EditorWikilinkPickerModalProps): any {
  const theme = useTheme();
  const { t, keys } = useTranslation();

  const [query, setQuery] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [allNodes, setAllNodes] = useState<GraphNode[]>([]);
  const scrollboxRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) return;

    setQuery("");
    setSelectedIndex(0);

    let mounted = true;
    void (async () => {
      try {
        const graphService = getGraphService();
        const vaultGraph = await graphService.buildVaultGraph({ force: true });
        if (mounted) {
          const existing = vaultGraph.nodes.filter((n) => n.exists);
          setAllNodes(existing);
        }
      } catch (err) {
        console.error("Failed to load notes for wikilink picker:", err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  const items: WikilinkItem[] = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const filtered: WikilinkItem[] = [];

    const matched = allNodes.filter((n) => {
      if (!trimmed) return true;
      const titleMatch = n.title.toLowerCase().includes(trimmed);
      const filenameMatch = n.filename.toLowerCase().includes(trimmed);
      const folderMatch = n.folderName.toLowerCase().includes(trimmed);
      const aliasMatch = n.aliases.some((a) =>
        a.toLowerCase().includes(trimmed),
      );
      const tagMatch = n.tags.some((tg) => tg.toLowerCase().includes(trimmed));
      return (
        titleMatch || filenameMatch || folderMatch || aliasMatch || tagMatch
      );
    });

    const exactMatch = allNodes.some(
      (n) =>
        n.title.toLowerCase() === trimmed ||
        n.filename.toLowerCase() === `${trimmed}.md` ||
        n.filename.toLowerCase() === trimmed,
    );

    if (trimmed.length > 0 && !exactMatch) {
      filtered.push({
        id: `new:${query.trim()}`,
        title: query.trim(),
        folderName: "",
        filename: `${query.trim()}.md`,
        isNew: true,
      });
    }

    for (const n of matched) {
      filtered.push({
        id: n.id,
        title: n.title,
        folderName: n.folderName,
        filename: n.filename,
        aliases: n.aliases,
        tags: n.tags,
      });
    }

    return filtered;
  }, [query, allNodes]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (scrollboxRef.current && items.length > 0 && selectedIndex >= 0) {
      scrollIndexIntoView(
        scrollboxRef.current,
        selectedIndex,
        1,
        items.length,
        selectedIndex,
      );
    }
  }, [selectedIndex, items.length]);

  useBindings(
    () => ({
      priority: 100,
      enabled: isOpen,
      commands: [
        {
          name: "wikilink.previous",
          run: () => {
            setSelectedIndex((prev) =>
              prev > 0 ? prev - 1 : Math.max(0, items.length - 1),
            );
          },
        },
        {
          name: "wikilink.next",
          run: () => {
            setSelectedIndex((prev) =>
              prev < items.length - 1 ? prev + 1 : 0,
            );
          },
        },
        {
          name: "wikilink.execute",
          run: () => {
            const selected = items[selectedIndex];
            if (selected) {
              const linkText = `[[${selected.title}]]`;
              onInsertWikilink(linkText);
              onClose();
            }
          },
        },
        {
          name: "wikilink.close",
          run: onClose,
        },
      ],
      bindings: [
        {
          key: "up, ctrl+k, ctrl+p",
          cmd: "wikilink.previous",
          desc: "Previous wikilink",
        },
        {
          key: "down, ctrl+j, ctrl+n, tab",
          cmd: "wikilink.next",
          desc: "Next wikilink",
        },
        {
          key: "shift+tab",
          cmd: "wikilink.previous",
          desc: "Previous wikilink",
        },
        {
          key: "return",
          cmd: "wikilink.execute",
          desc: "Insert wikilink",
        },
        {
          key: "escape",
          cmd: "wikilink.close",
          desc: "Close wikilink picker",
        },
      ],
    }),
    [isOpen, items, selectedIndex, onInsertWikilink, onClose],
  );

  useKeyboard((key) => {
    if (!isOpen) return;

    if (key.name === "escape") {
      key.preventDefault?.();
      onClose();
      return;
    }
  });

  if (!isOpen) return null;

  return (
    <box
      position="absolute"
      top={3}
      left="12%"
      width="76%"
      height={22}
      borderStyle="rounded"
      borderColor={theme.accent.cyan}
      flexDirection="column"
      padding={1}
      backgroundColor={theme.bg.panelAlt}
    >
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        marginBottom={1}
        flexShrink={0}
      >
        <box flexDirection="row" gap={1} alignItems="center">
          <text fg={theme.accent.cyan}>🔗</text>
          <text fg={theme.accent.primary}>{t(keys.EDITOR_WIKILINK_TITLE)}</text>
        </box>
        <text fg={theme.text.dim}>{t(keys.EDITOR_WIKILINK_CANCEL_HINT)}</text>
      </box>

      <box
        borderStyle="rounded"
        borderColor={theme.border.focus}
        paddingLeft={1}
        paddingRight={1}
        marginBottom={1}
        backgroundColor={theme.bg.input}
        flexShrink={0}
      >
        <input
          focused={true}
          value={query}
          onInput={(val: string) => setQuery(val)}
          placeholder={t(keys.EDITOR_WIKILINK_PLACEHOLDER)}
        />
      </box>

      <scrollbox
        ref={scrollboxRef}
        flexGrow={1}
        scrollY={true}
        scrollX={false}
        verticalScrollbarOptions={getScrollbarOptions(theme, true)}
      >
        {items.length === 0 ? (
          <box padding={1} justifyContent="center" alignItems="center">
            <text fg={theme.text.dim}>
              {t(keys.EDITOR_WIKILINK_NO_RESULTS)}
            </text>
          </box>
        ) : (
          items.map((item, idx) => {
            const isSelected = selectedIndex === idx;
            const prefix = isSelected ? "▸ " : "  ";
            const tags = item.tags || [];
            const displayTags = tags.slice(0, 2);
            const extraTagsCount = tags.length - displayTags.length;

            return (
              <box
                key={item.id}
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                width="100%"
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={isSelected ? theme.bg.selected : undefined}
              >
                <box
                  flexDirection="row"
                  gap={1}
                  alignItems="center"
                  flexShrink={1}
                >
                  <text fg={isSelected ? theme.accent.primary : theme.text.dim}>
                    {prefix}
                  </text>
                  <text
                    fg={
                      isSelected
                        ? theme.accent.primary
                        : item.isNew
                          ? theme.accent.yellow
                          : theme.accent.cyan
                    }
                  >
                    {item.isNew ? "✨" : "📄"}
                  </text>

                  {item.isNew ? (
                    <box flexDirection="row" alignItems="center">
                      <MarqueeText
                        text={t(keys.EDITOR_WIKILINK_NEW, { name: item.title })}
                        maxLength={34}
                        isSelected={isSelected}
                        isFocused={true}
                        fg={
                          isSelected
                            ? theme.accent.primary
                            : theme.accent.yellow
                        }
                      />
                    </box>
                  ) : (
                    <box flexDirection="row" alignItems="center">
                      <text
                        fg={isSelected ? theme.accent.primary : theme.text.dim}
                      >
                        [[
                      </text>
                      <MarqueeText
                        text={item.title}
                        maxLength={28}
                        isSelected={isSelected}
                        isFocused={true}
                        fg={
                          isSelected ? theme.accent.primary : theme.text.primary
                        }
                      />
                      <text
                        fg={isSelected ? theme.accent.primary : theme.text.dim}
                      >
                        ]]
                      </text>
                    </box>
                  )}

                  {!item.isNew && item.folderName && item.folderName !== "/" ? (
                    <text fg={theme.text.dim}>{`📁 ${item.folderName}`}</text>
                  ) : null}
                </box>

                <box
                  flexDirection="row"
                  gap={1}
                  alignItems="center"
                  flexShrink={0}
                >
                  {!item.isNew && displayTags.length > 0 ? (
                    <text fg={theme.accent.secondary}>
                      {displayTags.map((tg) => `#${tg}`).join(" ")}
                      {extraTagsCount > 0 ? ` +${extraTagsCount}` : ""}
                    </text>
                  ) : null}

                  {isSelected && (
                    <box
                      paddingLeft={1}
                      paddingRight={1}
                      backgroundColor={theme.bg.buttonPrimary}
                    >
                      <text fg={theme.text.primary}>
                        {t(keys.EDITOR_WIKILINK_INSERT_BTN)}
                      </text>
                    </box>
                  )}
                </box>
              </box>
            );
          })
        )}
      </scrollbox>

      <box
        flexDirection="row"
        justifyContent="center"
        alignItems="center"
        flexShrink={0}
        marginTop={1}
        paddingTop={1}
        borderStyle="single"
        borderColor={theme.border.subtle}
      >
        <text fg={theme.text.dim}>{t(keys.EDITOR_WIKILINK_HINT)}</text>
      </box>
    </box>
  );
}
