import { I18N_KEYS } from "../i18n/keys";

export type HelpTab = "context" | "global" | "todos" | "about";
type TranslationKey = keyof typeof I18N_KEYS;

export interface HelpEntry {
  key: string;
  description: TranslationKey;
}

export interface HelpSection {
  id: string;
  title: TranslationKey;
  entries: HelpEntry[];
}

const AI_HELP_DESCRIPTION = "HELP_DESC_EDITOR_AI";

function withoutAiEntries(section: HelpSection): HelpSection {
  return {
    ...section,
    entries: section.entries.filter(
      (entry) => entry.description !== AI_HELP_DESCRIPTION,
    ),
  };
}

const navigatorSection: HelpSection = {
  id: "navigator",
  title: "HELP_SEC_NAVIGATOR",
  entries: [
    { key: "Enter / Space", description: "HELP_DESC_NAV_SELECT" },
    { key: "n / Ctrl+F", description: "HELP_DESC_NAV_NEW_FOLDER" },
    { key: "r / F2", description: "HELP_DESC_NAV_RENAME_FOLDER" },
    {
      key: "d / Delete / Backspace",
      description: "HELP_DESC_NAV_DELETE_FOLDER",
    },
    { key: "Up / Down / j / k", description: "HELP_DESC_NAV_NAVIGATE" },
  ],
};

const notesSection: HelpSection = {
  id: "notes",
  title: "HELP_SEC_NOTES_LIST",
  entries: [
    { key: "Enter / Space", description: "HELP_DESC_NOTES_OPEN" },
    { key: "/", description: "HELP_DESC_LIST_FILTER" },
    { key: "Ctrl+N", description: "HELP_DESC_NOTES_NEW" },
    { key: "v / Ctrl+E", description: "HELP_DESC_EDITOR_EXTERNAL" },
    { key: "m", description: "HELP_DESC_NOTES_MOVE" },
    { key: "d / Delete", description: "HELP_DESC_NOTES_DELETE" },
    { key: "Up / Down / j / k", description: "HELP_DESC_NOTES_NAV" },
    { key: "PgUp / PgDn", description: "HELP_DESC_NOTES_PAGE" },
    { key: "Home / End / g / G", description: "HELP_DESC_NOTES_JUMP" },
  ],
};

const todosSection: HelpSection = {
  id: "todos",
  title: "HELP_SEC_TODOS",
  entries: [
    { key: "Space / Enter", description: "HELP_DESC_TODO_TOGGLE" },
    { key: "s", description: "HELP_DESC_TODO_STATUS" },
    { key: "m", description: "HELP_DESC_TODO_PRIORITY" },
    { key: "g", description: "HELP_DESC_TODO_GOTO" },
    { key: "/", description: "HELP_DESC_LIST_FILTER" },
    { key: "o", description: "HELP_DESC_TODO_SORT" },
    { key: "1 / p", description: "HELP_DESC_TODO_FILTER_TODO" },
    { key: "2 / d", description: "HELP_DESC_TODO_FILTER_DONE" },
    { key: "3 / a", description: "HELP_DESC_TODO_FILTER_ALL" },
    { key: "t / f", description: "HELP_DESC_TODO_CYCLE_FILTERS" },
    { key: "Ctrl+R", description: "HELP_DESC_TODO_SYNC" },
  ],
};

const linksSection: HelpSection = {
  id: "links",
  title: "HELP_SEC_LINKS",
  entries: [
    { key: "Enter", description: "HELP_DESC_LINK_OPEN" },
    { key: "a", description: "HELP_DESC_LINK_ADD" },
    { key: "d / Delete / Backspace / x", description: "HELP_DESC_LINK_DELETE" },
    { key: "g", description: "HELP_DESC_LINK_GOTO" },
    { key: "/", description: "HELP_DESC_LIST_FILTER" },
    { key: "1 / m", description: "HELP_DESC_LINK_FILTER_MANUAL" },
    { key: "2 / n", description: "HELP_DESC_LINK_FILTER_NOTES" },
    { key: "3 / y", description: "HELP_DESC_LINK_FILTER_MYDAY" },
    { key: "4", description: "HELP_DESC_LINK_FILTER_ALL" },
    { key: "t / f", description: "HELP_DESC_LINK_CYCLE_FILTERS" },
    { key: "Up / Down / j / k", description: "HELP_DESC_LINK_NAV" },
    { key: "Ctrl+R", description: "HELP_DESC_LINK_RELOAD" },
  ],
};

const myDaySection: HelpSection = {
  id: "myday",
  title: "HELP_SEC_MYDAY",
  entries: [
    { key: "Enter / Space", description: "HELP_DESC_MYDAY_OPEN" },
    { key: "v / Ctrl+E", description: "HELP_DESC_EDITOR_EXTERNAL" },
    { key: "/ or g", description: "HELP_DESC_MYDAY_FILTER_GOTO" },
    { key: "Up / Down / j / k", description: "HELP_DESC_MYDAY_NAV" },
  ],
};

const editorViewSection: HelpSection = {
  id: "editor-view",
  title: "HELP_SEC_EDITOR",
  entries: [
    { key: "e / i / Enter", description: "HELP_DESC_EDITOR_ENTER_EDIT" },
    { key: "v / Ctrl+E", description: "HELP_DESC_EDITOR_EXTERNAL" },
    { key: "Ctrl/Cmd+C / y", description: "HELP_DESC_EDITOR_COPY" },
    { key: "Ctrl/Cmd+Shift+A", description: "HELP_DESC_EDITOR_AI" },
    { key: "b / Ctrl/Cmd+G", description: "EDITOR_LOCAL_GRAPH_TITLE" },
    { key: "h", description: "HELP_DESC_EDITOR_HISTORY" },
    { key: "a", description: "HELP_DESC_EDITOR_ATTACHMENTS" },
    { key: "m", description: "HELP_DESC_EDITOR_MOVE" },
    {
      key: "d / Delete / Backspace / Ctrl+D",
      description: "HELP_DESC_EDITOR_DELETE",
    },
    { key: "Esc", description: "HELP_DESC_EDITOR_FOCUS_LIST" },
    { key: "Up / Down / j / k", description: "HELP_DESC_EDITOR_SCROLL" },
    { key: "PgUp / PgDn / Space", description: "HELP_DESC_EDITOR_PAGE_SCROLL" },
    { key: "Home / End / Shift+G", description: "HELP_DESC_EDITOR_JUMP" },
  ],
};

const editorEditSection: HelpSection = {
  id: "editor-edit",
  title: "HELP_SEC_EDITOR",
  entries: [
    { key: "Ctrl/Cmd+S", description: "HELP_DESC_EDITOR_SAVE" },
    { key: "Esc", description: "HELP_DESC_EDITOR_EXIT" },
    { key: "Ctrl/Cmd+E", description: "HELP_DESC_EDITOR_EXTERNAL" },
    { key: "Ctrl/Cmd+B / I / L / T", description: "HELP_DESC_EDITOR_FORMAT" },
    { key: "Ctrl+Alt+K", description: "HELP_DESC_EDITOR_CODE_BLOCK" },
    { key: "Ctrl/Cmd+W", description: "HELP_DESC_EDITOR_WIKILINK" },
    { key: "Ctrl/Cmd+O", description: "HELP_DESC_EDITOR_ATTACH" },
    { key: "Ctrl/Cmd+Shift+A", description: "HELP_DESC_EDITOR_AI" },
    { key: "Ctrl/Cmd+C / X / V", description: "HELP_DESC_EDITOR_COPY" },
    { key: "Tab", description: "HELP_DESC_EDITOR_INDENT" },
  ],
};

export const globalSection: HelpSection = {
  id: "global",
  title: "HELP_SECTION_GLOBAL",
  entries: [
    { key: "Tab", description: "HELP_DESC_TAB_FOCUS" },
    { key: "Ctrl/Cmd+H / F1", description: "HELP_DESC_HELP_MODAL" },
    { key: "Ctrl/Cmd+P", description: "HELP_DESC_CMD_PALETTE" },
    { key: "Ctrl/Cmd+Q", description: "HELP_DESC_QUIT" },
  ],
};

export const todoGuideSection: HelpSection = {
  id: "todo-guide",
  title: "HELP_SECTION_TODOS_GUIDE",
  entries: [
    { key: "- [ ] / * [ ] / + [ ]", description: "HELP_TODO_STATUS_TODO" },
    { key: "- [>] / - [/]", description: "HELP_TODO_STATUS_PROGRESS" },
    { key: "- [!]", description: "HELP_TODO_STATUS_URGENT" },
    { key: "- [?]", description: "HELP_TODO_STATUS_QUESTION" },
    { key: "- [-]", description: "HELP_TODO_STATUS_PAUSED" },
    { key: "- [x] / - [X]", description: "HELP_TODO_STATUS_DONE" },
    {
      key: "@priority(high) / [High] / !high",
      description: "HELP_TODO_PRIORITY_HIGH",
    },
    {
      key: "@priority(medium) / [Medium]",
      description: "HELP_TODO_PRIORITY_MED",
    },
    {
      key: "@priority(low) / [Low] / !low",
      description: "HELP_TODO_PRIORITY_LOW",
    },
    { key: "@due(YYYY-MM-DD)", description: "HELP_TODO_DUEDATE_SYNTAX" },
    { key: "#tag", description: "HELP_TODO_TAGS_SYNTAX" },
  ],
};

export function getContextSection(
  viewMode: string,
  activePane: string,
  isEditing: boolean,
  aiConfigured = true,
): HelpSection {
  let section: HelpSection;
  if (activePane === "sidebar") section = navigatorSection;
  else if (viewMode === "todos") section = todosSection;
  else if (viewMode === "links") section = linksSection;
  else if (viewMode === "myday" && activePane === "list")
    section = myDaySection;
  else if (activePane === "editor") {
    section = isEditing ? editorEditSection : editorViewSection;
  } else section = notesSection;
  return aiConfigured ? section : withoutAiEntries(section);
}

export function getSearchSections(aiConfigured = true): HelpSection[] {
  const sections = [
    navigatorSection,
    notesSection,
    todosSection,
    linksSection,
    myDaySection,
    editorViewSection,
    editorEditSection,
    globalSection,
    todoGuideSection,
  ];
  return aiConfigured ? sections : sections.map(withoutAiEntries);
}

export function matchesHelpEntry(
  entry: HelpEntry,
  query: string,
  translate: (key: string) => string,
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const descKey =
    (I18N_KEYS && I18N_KEYS[entry.description]) ||
    (entry.description as string);
  const translatedDesc =
    typeof translate === "function" ? translate(descKey) : "";
  return `${entry.key} ${translatedDesc}`.toLocaleLowerCase().includes(needle);
}
