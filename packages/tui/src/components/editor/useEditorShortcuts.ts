import { RefObject } from "react";
import { useBindings } from "@opentui/keymap/react";
import { readTextFromClipboard } from "../../clipboard";
import { useTranslation } from "../../i18n";
import { TuiActiveNote } from "../../types";

interface UseEditorShortcutsParams {
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  activeNote: TuiActiveNote | null;
  textareaRef: RefObject<any>;
  scrollboxRef: RefObject<any>;
  isPaneFocused: boolean;
  isCommandPaletteOpen: boolean;
  isHelpOpen: boolean;
  noteModalType: string | null;
  folderModalType: string | null;
  isAiModalOpen: boolean;
  aiConfigured: boolean;
  setIsAiModalOpen: (open: boolean) => void;
  isHistoryOpen?: boolean;
  setIsHistoryOpen?: (open: boolean) => void;
  isLocalGraphOpen?: boolean;
  setIsLocalGraphOpen?: (open: boolean) => void;
  isWikilinkPickerOpen?: boolean;
  setIsWikilinkPickerOpen?: (open: boolean) => void;
  isAttachFileModalOpen?: boolean;
  setIsAttachFileModalOpen?: (open: boolean) => void;
  isAttachmentsListOpen?: boolean;
  setIsAttachmentsListOpen?: (open: boolean) => void;
  saveNoteContent: (content: string) => Promise<void>;
  markNoteDirty: () => void;
  copyToClipboard: (
    text: string,
    customMessage?: string,
    showPopup?: boolean,
  ) => Promise<boolean>;
  setStatusMessage: (msg: string) => void;
  openNoteModal: (
    type: "delete" | "move",
    noteInfo: { folderName: string; filename: string; title: string },
  ) => void;
  setActivePane: (pane: any) => void;
  openInExternalEditor?: () => void;
}

export function wrapTextWithTodo(text: string): string {
  const lines = text.split("\n");
  const wrappedLines = lines.map((line) => {
    if (!line.trim()) return line;
    if (/^\s*-\s*\[[ xX/!?-]\]/.test(line)) {
      return line;
    }
    if (/^(\s*)[-*+]\s+(.*)$/.test(line)) {
      return line.replace(/^(\s*)[-*+]\s+(.*)$/, "$1- [ ] $2");
    }
    return line.replace(/^(\s*)(.*)$/, "$1- [ ] $2");
  });
  return wrappedLines.join("\n");
}

export function wrapTextWithLink(selection: string): string {
  const trimmed = selection.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return `[Title](${trimmed})`;
  }
  return `[${selection}](https://)`;
}

export function wrapTextWithWikilink(selection: string): string {
  return `[[${selection}]]`;
}

export function buildAttachmentLink(filename: string, url: string): string {
  return `[${filename}](${url})`;
}

export function useEditorShortcuts({
  isEditing,
  setIsEditing,
  activeNote,
  textareaRef,
  scrollboxRef,
  isPaneFocused,
  isCommandPaletteOpen,
  isHelpOpen,
  noteModalType,
  folderModalType,
  isAiModalOpen,
  aiConfigured,
  setIsAiModalOpen,
  isHistoryOpen,
  setIsHistoryOpen,
  isLocalGraphOpen,
  setIsLocalGraphOpen,
  isWikilinkPickerOpen,
  setIsWikilinkPickerOpen,
  isAttachFileModalOpen,
  setIsAttachFileModalOpen,
  isAttachmentsListOpen,
  setIsAttachmentsListOpen,
  saveNoteContent,
  markNoteDirty,
  copyToClipboard,
  setStatusMessage,
  openNoteModal,
  setActivePane,
  openInExternalEditor,
}: UseEditorShortcutsParams) {
  const { t, keys } = useTranslation();
  const editorAvailable =
    isPaneFocused &&
    !isCommandPaletteOpen &&
    !isHelpOpen &&
    !isAiModalOpen &&
    !isHistoryOpen &&
    !isLocalGraphOpen &&
    !isWikilinkPickerOpen &&
    !isAttachFileModalOpen &&
    !isAttachmentsListOpen &&
    !noteModalType &&
    !folderModalType;

  const wrapSelectionOrInsert = (wrapper: string, placeholder: string) => {
    const ta = textareaRef.current;
    if (!ta) return;

    try {
      const hasSel = Boolean(ta.hasSelection?.());
      const selection = hasSel ? (ta.getSelectedText?.() ?? "") : "";
      if (selection.length > 0) {
        ta.deleteSelection?.();
        ta.insertText(`${wrapper}${selection}${wrapper}`);
      } else {
        ta.insertText(`${wrapper}${placeholder}${wrapper}`);
        const end = ta.cursorOffset - wrapper.length;
        ta.setSelection?.(end - placeholder.length, end);
      }
      markNoteDirty();
    } catch (err) {
      console.error("Failed to wrap selection or insert text:", err);
    }
  };

  const insertWikilinkSnippet = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    try {
      const hasSel = Boolean(ta.hasSelection?.());
      const selection = hasSel ? (ta.getSelectedText?.() ?? "") : "";
      if (selection.length > 0) {
        ta.deleteSelection?.();
        ta.insertText(wrapTextWithWikilink(selection));
        markNoteDirty();
      } else {
        setIsWikilinkPickerOpen?.(true);
      }
    } catch (err) {
      console.error("Failed to insert wikilink snippet:", err);
    }
  };

  const insertLinkSnippet = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    try {
      const hasSel = Boolean(ta.hasSelection?.());
      const selection = hasSel ? (ta.getSelectedText?.() ?? "") : "";
      if (selection.length > 0) {
        ta.deleteSelection?.();
        ta.insertText(wrapTextWithLink(selection));
      } else {
        ta.insertText("[Title](https://)");
      }
      markNoteDirty();
    } catch (err) {
      console.error("Failed to insert link snippet:", err);
    }
  };

  const insertTodoSnippet = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    try {
      const hasSel = Boolean(ta.hasSelection?.());
      const selection = hasSel ? (ta.getSelectedText?.() ?? "") : "";
      if (selection.length > 0) {
        ta.deleteSelection?.();
        ta.insertText(wrapTextWithTodo(selection));
      } else {
        ta.insertText("\n- [ ] ");
      }
      markNoteDirty();
    } catch (err) {
      console.error("Failed to insert todo snippet:", err);
    }
  };

  const insertCodeBlockSnippet = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    try {
      const hasSel = Boolean(ta.hasSelection?.());
      const selection = hasSel ? (ta.getSelectedText?.() ?? "") : "";
      if (selection.length > 0) {
        ta.deleteSelection?.();
        ta.insertText(`\n\`\`\`ts\n${selection}\n\`\`\`\n`);
      } else {
        ta.insertText("\n```ts\n// code here\n```\n");
      }
      markNoteDirty();
    } catch (err) {
      console.error("Failed to insert code block snippet:", err);
    }
  };

  const copySelection = async () => {
    const selection = textareaRef.current?.hasSelection?.()
      ? textareaRef.current.getSelectedText?.()
      : "";
    if (!selection) return false;
    const copied = await copyToClipboard(selection);
    if (copied) setStatusMessage(t(keys.EDITOR_COPIED_CLIPBOARD));
    return copied;
  };

  const copyNote = async () => {
    if (!activeNote?.content) return false;
    return copyToClipboard(activeNote.content);
  };

  const cutSelection = async () => {
    const ta = textareaRef.current;
    if (!ta?.hasSelection?.()) return false;
    const selection = ta.getSelectedText?.();
    if (!selection || !(await copyToClipboard(selection, undefined, false)))
      return false;
    ta.deleteSelection?.();
    markNoteDirty();
    setStatusMessage(t(keys.EDITOR_CUT_CLIPBOARD));
    return true;
  };

  const pasteClipboard = async () => {
    const ta = textareaRef.current;
    const text = await readTextFromClipboard();
    if (!ta || text === null) return false;
    try {
      if (ta.hasSelection?.()) ta.deleteSelection?.();
      ta.insertText(text);
      markNoteDirty();
      return true;
    } catch (err) {
      console.error("Failed to paste clipboard text:", err);
      return false;
    }
  };

  const handleSave = async () => {
    if (!activeNote) return;
    try {
      await saveNoteContent(
        textareaRef.current?.plainText ?? activeNote.content,
      );
      setStatusMessage(t(keys.EDITOR_SAVED_SUCCESS));
    } catch (err: any) {
      console.error("Failed to save note:", err);
      setStatusMessage(t(keys.EDITOR_SAVE_FAILED, { error: err.message }));
    }
  };

  const openNoteModalForActiveNote = (type: "delete" | "move") => {
    if (!activeNote) return;
    openNoteModal(type, {
      folderName: activeNote.folderName,
      filename: activeNote.filename,
      title: activeNote.title,
    });
  };

  const scroll = (y: number, absolute = false) => {
    try {
      if (absolute) scrollboxRef.current?.scrollTo?.({ y, x: 0 });
      else scrollboxRef.current?.scrollBy?.({ y, x: 0 });
    } catch (err) {
      console.error("Failed to scroll editor:", err);
    }
  };

  useBindings(
    () => ({
      priority: 100,
      enabled: editorAvailable && isEditing,
      commands: [
        { name: "editor.save", run: () => void handleSave() },
        {
          name: "editor.exit",
          run: () => {
            void handleSave();
            setIsEditing(false);
          },
        },
        { name: "editor.copy", run: () => void copySelection() },
        { name: "editor.cut", run: () => void cutSelection() },
        { name: "editor.paste", run: () => void pasteClipboard() },
        {
          name: "editor.bold",
          run: () => wrapSelectionOrInsert("**", "bold text"),
        },
        {
          name: "editor.italic",
          run: () => wrapSelectionOrInsert("*", "italic text"),
        },
        { name: "editor.link", run: insertLinkSnippet },
        { name: "editor.todo", run: insertTodoSnippet },
        { name: "editor.codeBlock", run: insertCodeBlockSnippet },
        { name: "editor.wikilink", run: insertWikilinkSnippet },
        {
          name: "editor.attachFile",
          run: () => setIsAttachFileModalOpen?.(true),
        },
        ...(aiConfigured
          ? [{ name: "editor.ai", run: () => setIsAiModalOpen(true) }]
          : []),
        {
          name: "editor.externalEditor",
          run: () => void openInExternalEditor?.(),
        },
        {
          name: "editor.indent",
          run: () => {
            textareaRef.current?.insertText("  ");
            markNoteDirty();
          },
        },
      ],
      bindings: [
        { key: "ctrl+s", cmd: "editor.save", desc: "Save note" },
        { key: "super+s", cmd: "editor.save", desc: "Save note" },
        {
          key: "ctrl+o",
          cmd: "editor.attachFile",
          desc: "Attach file",
        },
        {
          key: "super+o",
          cmd: "editor.attachFile",
          desc: "Attach file",
        },
        {
          key: "ctrl+e",
          cmd: "editor.externalEditor",
          desc: "Open in external editor",
        },
        {
          key: "super+e",
          cmd: "editor.externalEditor",
          desc: "Open in external editor",
        },
        { key: "escape", cmd: "editor.exit", desc: "Save and exit editing" },
        { key: "ctrl+c", cmd: "editor.copy", desc: "Copy selection" },
        { key: "super+c", cmd: "editor.copy", desc: "Copy selection" },
        { key: "ctrl+x", cmd: "editor.cut", desc: "Cut selection" },
        { key: "super+x", cmd: "editor.cut", desc: "Cut selection" },
        { key: "ctrl+v", cmd: "editor.paste", desc: "Paste clipboard" },
        { key: "super+v", cmd: "editor.paste", desc: "Paste clipboard" },
        { key: "ctrl+b", cmd: "editor.bold", desc: "Bold" },
        { key: "super+b", cmd: "editor.bold", desc: "Bold" },
        { key: "ctrl+i", cmd: "editor.italic", desc: "Italic" },
        { key: "super+i", cmd: "editor.italic", desc: "Italic" },
        { key: "ctrl+l", cmd: "editor.link", desc: "Insert link" },
        { key: "super+l", cmd: "editor.link", desc: "Insert link" },
        { key: "ctrl+t", cmd: "editor.todo", desc: "Insert todo" },
        { key: "super+t", cmd: "editor.todo", desc: "Insert todo" },
        {
          key: "ctrl+alt+k",
          cmd: "editor.codeBlock",
          desc: "Insert code block",
        },
        { key: "ctrl+w", cmd: "editor.wikilink", desc: "Insert wikilink" },
        { key: "super+w", cmd: "editor.wikilink", desc: "Insert wikilink" },
        ...(aiConfigured
          ? [
              {
                key: "ctrl+shift+a",
                cmd: "editor.ai",
                desc: "Open AI assistant",
              },
              {
                key: "super+shift+a",
                cmd: "editor.ai",
                desc: "Open AI assistant",
              },
            ]
          : []),
        { key: "tab", cmd: "editor.indent", desc: "Indent" },
      ],
    }),
    [
      editorAvailable,
      isEditing,
      aiConfigured,
      activeNote,
      handleSave,
      setIsEditing,
      setIsWikilinkPickerOpen,
      setIsAttachFileModalOpen,
      setIsAiModalOpen,
      markNoteDirty,
      openInExternalEditor,
    ],
  );

  useBindings(
    () => ({
      priority: 10,
      enabled: editorAvailable && !isEditing,
      commands: [
        { name: "editor.enter", run: () => setIsEditing(true) },
        {
          name: "editor.externalEditor",
          run: () => void openInExternalEditor?.(),
        },
        { name: "editor.copyNote", run: () => void copyNote() },
        ...(aiConfigured
          ? [{ name: "editor.ai", run: () => setIsAiModalOpen(true) }]
          : []),
        { name: "editor.graph", run: () => setIsLocalGraphOpen?.(true) },
        { name: "editor.history", run: () => setIsHistoryOpen?.(true) },
        {
          name: "editor.attachments",
          run: () => setIsAttachmentsListOpen?.(true),
        },
        { name: "editor.move", run: () => openNoteModalForActiveNote("move") },
        {
          name: "editor.delete",
          run: () => openNoteModalForActiveNote("delete"),
        },
        { name: "editor.focusList", run: () => setActivePane("list") },
        { name: "editor.scrollDown", run: () => scroll(3) },
        { name: "editor.scrollUp", run: () => scroll(-3) },
        { name: "editor.pageDown", run: () => scroll(10) },
        { name: "editor.pageUp", run: () => scroll(-10) },
        { name: "editor.toStart", run: () => scroll(0, true) },
        { name: "editor.toEnd", run: () => scroll(99999, true) },
      ],
      bindings: [
        { key: "e, i, return", cmd: "editor.enter", desc: "Edit note" },
        {
          key: "v, ctrl+e, super+e",
          cmd: "editor.externalEditor",
          desc: "Open in external editor",
        },
        {
          key: "ctrl+c, super+c, y",
          cmd: "editor.copyNote",
          desc: "Copy note",
        },
        ...(aiConfigured
          ? [
              {
                key: "ctrl+shift+a, super+shift+a",
                cmd: "editor.ai",
                desc: "Open AI assistant",
              },
            ]
          : []),
        {
          key: "b, ctrl+g, super+g",
          cmd: "editor.graph",
          desc: "Open local graph",
        },
        { key: "h", cmd: "editor.history", desc: "Open note history" },
        { key: "a", cmd: "editor.attachments", desc: "Open attachments" },
        { key: "m", cmd: "editor.move", desc: "Move note" },
        {
          key: "d, delete, backspace, ctrl+d",
          cmd: "editor.delete",
          desc: "Delete note",
        },
        { key: "escape", cmd: "editor.focusList", desc: "Focus note list" },
        { key: "down, j", cmd: "editor.scrollDown", desc: "Scroll down" },
        { key: "up, k", cmd: "editor.scrollUp", desc: "Scroll up" },
        { key: "pagedown, space", cmd: "editor.pageDown", desc: "Page down" },
        { key: "pageup", cmd: "editor.pageUp", desc: "Page up" },
        { key: "home", cmd: "editor.toStart", desc: "Go to start" },
        { key: "end, shift+g", cmd: "editor.toEnd", desc: "Go to end" },
      ],
    }),
    [
      editorAvailable,
      isEditing,
      aiConfigured,
      activeNote,
      setIsEditing,
      setIsAiModalOpen,
      setIsLocalGraphOpen,
      setIsHistoryOpen,
      setIsAttachmentsListOpen,
      openNoteModal,
      setActivePane,
      openInExternalEditor,
    ],
  );

  return {
    handleSave,
    wrapSelectionOrInsert,
    insertWikilinkSnippet,
    insertLinkSnippet,
    insertTodoSnippet,
    insertCodeBlockSnippet,
    copySelection,
    cutSelection,
    pasteClipboard,
  };
}
