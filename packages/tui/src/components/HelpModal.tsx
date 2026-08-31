import React, { useEffect, useState, useRef } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useBindings } from "@opentui/keymap/react";
import { useAppStore } from "../store";
import { useTranslation } from "../i18n";
import { getScrollbarOptions, useTheme } from "../theme";
import { hasConfiguredProvider } from "@lyratui/core";
import type { HelpSection, HelpTab } from "./helpContent";
import {
  getContextSection,
  getSearchSections,
  globalSection,
  matchesHelpEntry,
  todoGuideSection,
} from "./helpContent";

const tabs: HelpTab[] = ["context", "global", "todos", "about"];

export function HelpModal(): any {
  const theme = useTheme();
  const isHelpOpen = useAppStore((s) => s.isHelpOpen);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const activePane = useAppStore((s) => s.activePane);
  const viewMode = useAppStore((s) => s.viewMode);
  const isEditing = useAppStore((s) => s.isEditing);
  const { t, keys } = useTranslation();
  const aiConfigured = hasConfiguredProvider();
  const { width: termWidth = 100, height: termHeight = 30 } =
    useTerminalDimensions();

  const [activeTab, setActiveTab] = useState<HelpTab>("context");
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const scrollboxRef = useRef<any>(null);

  const scroll = (y: number, absolute = false) => {
    try {
      if (absolute) scrollboxRef.current?.scrollTo?.({ y, x: 0 });
      else scrollboxRef.current?.scrollBy?.({ y, x: 0 });
    } catch (err) {
      console.error("Failed to scroll help modal:", err);
    }
  };

  useEffect(() => {
    if (!isHelpOpen) return;
    setActiveTab("context");
    setQuery("");
    setIsSearching(false);
  }, [isHelpOpen]);

  useEffect(() => {
    if (isHelpOpen) {
      scroll(0, true);
    }
  }, [activeTab, query, isHelpOpen]);

  useBindings(
    () => ({
      priority: 100,
      enabled: isHelpOpen,
      commands: [
        {
          name: "help.close",
          run: () => {
            if (query || isSearching) {
              setQuery("");
              setIsSearching(false);
            } else {
              setHelpOpen(false);
            }
          },
        },
        {
          name: "help.toggle",
          run: () => setHelpOpen(false),
        },
        {
          name: "help.palette",
          run: () => {
            setHelpOpen(false);
            setCommandPaletteOpen(true);
          },
        },
        {
          name: "help.tab.next",
          run: () => {
            setActiveTab(
              (prev) => tabs[(tabs.indexOf(prev) + 1) % tabs.length],
            );
          },
        },
        {
          name: "help.tab.previous",
          run: () => {
            setActiveTab(
              (prev) =>
                tabs[(tabs.indexOf(prev) + tabs.length - 1) % tabs.length],
            );
          },
        },
        { name: "help.scrollDown", run: () => scroll(3) },
        { name: "help.scrollUp", run: () => scroll(-3) },
        { name: "help.pageDown", run: () => scroll(8) },
        { name: "help.pageUp", run: () => scroll(-8) },
        { name: "help.toStart", run: () => scroll(0, true) },
        { name: "help.toEnd", run: () => scroll(99999, true) },
      ],
      bindings: [
        { key: "escape", cmd: "help.close", desc: "Close help" },
        {
          key: "ctrl+h, super+h, f1",
          cmd: "help.toggle",
          desc: "Close help modal",
        },
        {
          key: "ctrl+p, super+p",
          cmd: "help.palette",
          desc: "Open command palette",
        },
        { key: "tab", cmd: "help.tab.next", desc: "Next help tab" },
        {
          key: "shift+tab",
          cmd: "help.tab.previous",
          desc: "Previous help tab",
        },
        { key: "up, ctrl+k, ctrl+p", cmd: "help.scrollUp", desc: "Scroll up" },
        {
          key: "down, ctrl+j, ctrl+n",
          cmd: "help.scrollDown",
          desc: "Scroll down",
        },
        { key: "pageup", cmd: "help.pageUp", desc: "Page up" },
        { key: "pagedown", cmd: "help.pageDown", desc: "Page down" },
        { key: "home", cmd: "help.toStart", desc: "Scroll to top" },
        { key: "end", cmd: "help.toEnd", desc: "Scroll to bottom" },
      ],
    }),
    [isHelpOpen, query, isSearching, setHelpOpen, setCommandPaletteOpen],
  );

  useKeyboard((key) => {
    if (!isHelpOpen) return;

    if (key.name === "?") {
      key.preventDefault?.();
      setHelpOpen(false);
      return;
    }

    if (isSearching) {
      if (key.name === "return") {
        key.preventDefault?.();
        setIsSearching(false);
      }
      return;
    }

    if (key.name === "/") {
      key.preventDefault?.();
      setIsSearching(true);
      return;
    }

    if (key.name === "right") {
      key.preventDefault?.();
      setActiveTab((prev) => tabs[(tabs.indexOf(prev) + 1) % tabs.length]);
      return;
    }

    if (key.name === "left") {
      key.preventDefault?.();
      setActiveTab(
        (prev) => tabs[(tabs.indexOf(prev) + tabs.length - 1) % tabs.length],
      );
      return;
    }

    if (key.name === "j") {
      scroll(3);
      return;
    }

    if (key.name === "k") {
      scroll(-3);
      return;
    }

    if (key.name === "space") {
      scroll(8);
      return;
    }

    const tabNumber = Number(key.name);
    if (tabNumber >= 1 && tabNumber <= tabs.length) {
      key.preventDefault?.();
      setActiveTab(tabs[tabNumber - 1]);
    }
  });

  if (!isHelpOpen) return null;

  const contextSection = getContextSection(
    viewMode,
    activePane,
    isEditing,
    aiConfigured,
  );
  const selectedSection =
    activeTab === "context"
      ? contextSection
      : activeTab === "global"
        ? globalSection
        : todoGuideSection;
  const normalizedQuery = query.trim();
  const searchSections = normalizedQuery
    ? getSearchSections(aiConfigured)
        .map((section) => ({
          ...section,
          entries: section.entries.filter((entry) =>
            matchesHelpEntry(entry, normalizedQuery, t),
          ),
        }))
        .filter((section) => section.entries.length > 0)
    : [];
  const modalWidth = Math.max(24, Math.min(100, termWidth - 4));
  const modalHeight = Math.max(8, Math.min(32, termHeight - 2));
  const modalLeft = Math.max(0, Math.floor((termWidth - modalWidth) / 2));
  const compactTabs = modalWidth < 72;
  const keyWidth = Math.max(
    10,
    Math.min(activeTab === "todos" ? 25 : 22, Math.floor(modalWidth * 0.4)),
  );

  const renderRows = (section: HelpSection, color: string) => (
    <box flexDirection="column" key={section.id}>
      <box marginBottom={1} paddingLeft={1} flexShrink={0}>
        <text fg={color}>
          {t(keys?.[section.title] || (section.title as string))}
        </text>
      </box>
      {section.entries.map((entry) => (
        <box
          key={`${section.id}:${entry.key}`}
          flexDirection="row"
          width="100%"
          marginBottom={1}
          paddingLeft={1}
        >
          <box width={keyWidth} flexShrink={0}>
            <text fg={color}>{entry.key}</text>
          </box>
          <text fg={theme.text.secondary} flexGrow={1}>
            {t(keys?.[entry.description] || (entry.description as string))}
          </text>
        </box>
      ))}
    </box>
  );

  return (
    <box
      position="absolute"
      top={1}
      left={modalLeft}
      width={modalWidth}
      height={modalHeight}
      borderStyle="rounded"
      borderColor={theme.accent.secondary}
      flexDirection="column"
      padding={1}
      backgroundColor={theme.bg.panelAlt}
    >
      <box
        width="100%"
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        marginBottom={1}
        borderStyle="single"
        borderColor={theme.bg.badge}
        flexShrink={0}
      >
        <text fg={theme.accent.secondary}>{t(keys.HELP_TITLE)}</text>
        <text fg={theme.text.dim}>
          {t(keys.HELP_CONTEXT_FOCUS, {
            context: t(keys[contextSection.title]),
          })}
        </text>
      </box>

      <box
        flexDirection="row"
        gap={1}
        alignItems="center"
        marginBottom={1}
        flexShrink={0}
      >
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab;
          const backgroundColor =
            tab === "context"
              ? theme.bg.buttonPrimary
              : tab === "global"
                ? theme.accent.purpleDark
                : tab === "todos"
                  ? theme.accent.greenDark
                  : theme.accent.blueDark;
          const label = compactTabs
            ? `[${index + 1}]`
            : t(
                keys[
                  tab === "context"
                    ? "HELP_TAB_CONTEXT"
                    : tab === "global"
                      ? "HELP_TAB_GLOBAL"
                      : tab === "todos"
                        ? "HELP_TAB_TODOS"
                        : "HELP_TAB_ABOUT"
                ],
              );

          return (
            <box
              key={tab}
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={
                isActive ? backgroundColor : theme.bg.selectedAlt
              }
            >
              <text fg={isActive ? theme.text.primary : theme.text.muted}>
                {label}
              </text>
            </box>
          );
        })}
      </box>

      {(isSearching || normalizedQuery) && (
        <box
          borderStyle="rounded"
          borderColor={
            isSearching ? theme.accent.secondary : theme.border.subtle
          }
          paddingLeft={1}
          marginBottom={1}
          flexShrink={0}
          backgroundColor={theme.bg.input}
        >
          <input
            focused={isSearching}
            value={query}
            onInput={(value: string) => setQuery(value)}
            onChange={(value: string) => setQuery(value)}
            placeholder={t(keys.HELP_SEARCH_PLACEHOLDER)}
          />
        </box>
      )}

      <scrollbox
        ref={scrollboxRef}
        flexGrow={1}
        scrollY={true}
        scrollX={false}
        verticalScrollbarOptions={getScrollbarOptions(theme, true)}
      >
        {normalizedQuery ? (
          searchSections.length > 0 ? (
            <box flexDirection="column">
              <box marginBottom={1} paddingLeft={1}>
                <text fg={theme.accent.cyan}>
                  {t(keys.HELP_SEARCH_RESULTS)}
                </text>
              </box>
              {searchSections.map((section) =>
                renderRows(section, theme.accent.cyan),
              )}
            </box>
          ) : (
            <box alignItems="center" justifyContent="center" padding={2}>
              <text fg={theme.text.muted}>{t(keys.HELP_SEARCH_EMPTY)}</text>
            </box>
          )
        ) : activeTab === "about" ? (
          <box flexDirection="column" paddingLeft={1} gap={1}>
            <text fg={theme.accent.cyan}>{t(keys.HELP_SECTION_ABOUT)}</text>
            <box
              flexDirection="column"
              borderStyle="rounded"
              borderColor={theme.border.subtle}
              backgroundColor={theme.bg.panel}
              padding={1}
            >
              <text fg={theme.accent.green}>
                {t(keys.HELP_ABOUT_THANKS_TITLE)}
              </text>
              <text fg={theme.text.secondary}>
                {t(keys.HELP_ABOUT_THANKS_DESC)}
              </text>
            </box>
            <box flexDirection="row" gap={1} paddingLeft={1}>
              <text fg={theme.accent.primary}>
                {t(keys.HELP_ABOUT_REPO_LABEL)}
              </text>
              <text fg={theme.accent.cyan}>{t(keys.HELP_ABOUT_REPO_URL)}</text>
            </box>
          </box>
        ) : (
          renderRows(
            selectedSection,
            activeTab === "global"
              ? theme.accent.purple
              : activeTab === "todos"
                ? theme.accent.green
                : theme.accent.primary,
          )
        )}
      </scrollbox>

      <box
        flexDirection="row"
        justifyContent="space-between"
        marginTop={1}
        borderStyle="single"
        borderColor={theme.border.subtle}
        flexShrink={0}
      >
        <text fg={theme.text.muted}>{t(keys.HELP_HEADER_HINT)}</text>
        <text fg={theme.text.dim}>{t(keys.HELP_SEARCH_HINT)}</text>
      </box>
    </box>
  );
}
