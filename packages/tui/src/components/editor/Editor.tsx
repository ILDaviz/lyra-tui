import React, { useEffect, useRef, useMemo } from "react";
import { useAppStore } from "../../store";
import { useRenderer } from "@opentui/react";
import { getTreeSitterClient } from "@opentui/core";
import { detectFiletype, createEditorSyntaxStyle } from "./syntax";
import { cleanMarkdownForDisplay } from "./cleaner";
import { createCodeBlockRenderer } from "./CodeBlockRenderer";
import { EditorHeader } from "./EditorHeader";
import { EditorToolbar } from "./EditorToolbar";
import { EditorEmpty } from "./EditorEmpty";
import { EditorAiModal } from "./EditorAiModal";
import { EditorHistoryModal } from "./EditorHistoryModal";
import { EditorLocalGraphModal } from "./EditorLocalGraphModal";
import { EditorWikilinkPickerModal } from "./EditorWikilinkPickerModal";
import { EditorAttachFileModal } from "./EditorAttachFileModal";
import { EditorAttachmentsModal } from "./EditorAttachmentsModal";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { useTheme, getScrollbarOptions } from "../../theme";
import { extractAttachments, hasConfiguredProvider } from "@lyratui/core";

export function Editor(): any {
  const theme = useTheme();
  const activeNote = useAppStore((s) => s.activeNote);
  const isEditing = useAppStore((s) => s.isEditing);
  const setIsEditing = useAppStore((s) => s.setIsEditing);
  const saveNoteContent = useAppStore((s) => s.saveNoteContent);
  const markNoteDirty = useAppStore((s) => s.markNoteDirty);
  const activePane = useAppStore((s) => s.activePane);
  const setActivePane = useAppStore((s) => s.setActivePane);
  const openNoteModal = useAppStore((s) => s.openNoteModal);
  const noteModalType = useAppStore((s) => s.noteModal.type);
  const folderModalType = useAppStore((s) => s.folderModal.type);
  const isCommandPaletteOpen = useAppStore((s) => s.isCommandPaletteOpen);
  const isHelpOpen = useAppStore((s) => s.isHelpOpen);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const copyToClipboard = useAppStore((s) => s.copyToClipboard);
  const isHistoryOpen = useAppStore((s) => s.isNoteHistoryOpen);
  const setIsHistoryOpen = useAppStore((s) => s.setNoteHistoryOpen);
  const openInExternalEditor = useAppStore((s) => s.openInExternalEditor);

  const isPaneFocused = activePane === "editor";
  const aiConfigured = hasConfiguredProvider();
  const renderer = useRenderer();

  const isAiModalOpen = useAppStore((s) => s.isAiModalOpen);
  const setIsAiModalOpen = useAppStore((s) => s.setAiModalOpen);
  const isLocalGraphOpen = useAppStore((s) => s.isLocalGraphOpen);
  const setIsLocalGraphOpen = useAppStore((s) => s.setLocalGraphOpen);
  const isWikilinkPickerOpen = useAppStore((s) => s.isWikilinkPickerOpen);
  const setIsWikilinkPickerOpen = useAppStore((s) => s.setWikilinkPickerOpen);
  const isAttachFileModalOpen = useAppStore((s) => s.isAttachFileModalOpen);
  const setIsAttachFileModalOpen = useAppStore((s) => s.setAttachFileModalOpen);
  const isAttachmentsListOpen = useAppStore((s) => s.isAttachmentsListOpen);
  const setIsAttachmentsListOpen = useAppStore((s) => s.setAttachmentsListOpen);
  const textareaRef = useRef<any>(null);
  const scrollboxRef = useRef<any>(null);

  const syntaxStyle = useMemo(() => createEditorSyntaxStyle(theme), [theme]);

  const renderCodeBlockNode = useMemo(
    () => createCodeBlockRenderer(renderer, syntaxStyle, theme),
    [renderer, syntaxStyle, theme],
  );

  const tableOptions = useMemo(
    () =>
      ({
        style: "grid",
        borderStyle: "rounded",
        borderColor: theme.border.default,
        cellPaddingX: 1,
      }) as const,
    [theme],
  );

  const displayContent = useMemo(
    () => cleanMarkdownForDisplay(activeNote?.content || ""),
    [activeNote?.content],
  );

  useEditorShortcuts({
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
    openInExternalEditor: () => openInExternalEditor(renderer),
  });

  const handleInsertWikilink = (linkText: string) => {
    const ta = textareaRef.current;
    if (ta) {
      try {
        ta.insertText?.(linkText);
        markNoteDirty();
        ta.focus?.();
      } catch (err) {
        console.error("Failed to insert wikilink text:", err);
      }
    }
  };

  const handleInsertAttachment = (linkText: string) => {
    const ta = textareaRef.current;
    if (ta && isEditing) {
      try {
        ta.insertText?.(linkText);
        markNoteDirty();
        ta.focus?.();
      } catch (err) {
        console.error("Failed to insert attachment link:", err);
      }
    } else if (activeNote) {
      const updated = `${(activeNote.content || "").trimEnd()}\n\n${linkText}\n`;
      void saveNoteContent(updated);
    }
  };

  const applyAiContent = async (
    newContent: string,
    mode: "replace" | "append" | "cursor" = "replace",
  ) => {
    const ta = textareaRef.current;

    if (mode === "cursor" && isEditing && ta) {
      try {
        if (ta.hasSelection?.()) {
          ta.deleteSelection?.();
        }
        ta.insertText?.(newContent);
        ta.focus?.();
        const updated = ta.plainText;
        await saveNoteContent(updated);
        return;
      } catch (err) {
        console.error("Failed to insert at cursor:", err);
      }
    }

    if (mode === "append") {
      const current =
        isEditing && ta ? ta.plainText : activeNote?.content || "";
      const updated = `${current.trimEnd()}\n\n${newContent.trim()}\n`;
      if (isEditing && ta) {
        try {
          ta.setText?.(updated);
          ta.focus?.();
        } catch (err) {
          console.error("Failed to set textarea text:", err);
        }
      }
      await saveNoteContent(updated);
      return;
    }

    if (isEditing && ta) {
      try {
        ta.setText?.(newContent);
        ta.focus?.();
      } catch (err) {
        console.error("Failed to set textarea text:", err);
      }
    }
    await saveNoteContent(newContent);
  };

  useEffect(() => {
    if (
      isEditing &&
      !isAiModalOpen &&
      !isWikilinkPickerOpen &&
      !isAttachFileModalOpen &&
      !isAttachmentsListOpen &&
      !isLocalGraphOpen &&
      !isHistoryOpen
    ) {
      const timer = setTimeout(() => {
        try {
          textareaRef.current?.focus?.();
        } catch (err) {
          console.error("Failed to refocus textarea:", err);
        }
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [
    isEditing,
    isAiModalOpen,
    isWikilinkPickerOpen,
    isAttachFileModalOpen,
    isAttachmentsListOpen,
    isLocalGraphOpen,
    isHistoryOpen,
  ]);

  useEffect(() => {
    if (activeNote && textareaRef.current) {
      if (textareaRef.current.plainText !== activeNote.content) {
        try {
          textareaRef.current.setText?.(activeNote.content || "");
        } catch (err) {
          console.error("Failed to set textarea text:", err);
        }
      }
    }
  }, [activeNote?.content, activeNote?.filename, activeNote?.folderName]);

  const noteAttachments = useMemo(
    () => extractAttachments(activeNote?.content || ""),
    [activeNote?.content],
  );

  if (!activeNote) {
    return <EditorEmpty />;
  }

  const lines = (activeNote.content || "").split("\n");
  const wordCount = (activeNote.content || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const rawTitle = activeNote.title || activeNote.filename;
  const codeFiletype = detectFiletype(activeNote.filename);

  const isModalActive =
    (isAiModalOpen && aiConfigured) ||
    isWikilinkPickerOpen ||
    isAttachFileModalOpen ||
    isAttachmentsListOpen ||
    isLocalGraphOpen ||
    isHistoryOpen;

  return (
    <box
      borderStyle="rounded"
      borderColor={
        isEditing
          ? theme.border.focus
          : isPaneFocused
            ? theme.border.info
            : theme.border.subtle
      }
      flexGrow={1}
      flexShrink={1}
      height="100%"
      flexDirection="column"
      padding={1}
      backgroundColor={theme.bg.panel}
    >
      <EditorHeader
        title={rawTitle}
        folder={activeNote.folderName}
        linesCount={lines.length}
        wordsCount={wordCount}
        isEditing={isEditing}
      />

      {isEditing ? (
        <box
          flexGrow={1}
          width="100%"
          flexDirection="column"
          backgroundColor={theme.bg.app}
          padding={1}
        >
          <textarea
            ref={textareaRef}
            initialValue={activeNote.content}
            focused={isEditing && !isModalActive && !isHelpOpen}
            onContentChange={markNoteDirty}
            style={{ flexGrow: 1, width: "100%" }}
          />
          <EditorToolbar />
        </box>
      ) : (
        <scrollbox
          ref={scrollboxRef}
          key={`${activeNote.folderName}/${activeNote.filename}:${activeNote.content}`}
          flexGrow={1}
          width="100%"
          scrollY={true}
          scrollX={false}
          paddingLeft={1}
          paddingRight={1}
          verticalScrollbarOptions={getScrollbarOptions(theme, isPaneFocused)}
        >
          {codeFiletype ? (
            <code
              content={activeNote.content || ""}
              filetype={codeFiletype}
              syntaxStyle={syntaxStyle}
              treeSitterClient={getTreeSitterClient()}
              drawUnstyledText={true}
              wrapMode="word"
            />
          ) : (
            <markdown
              content={displayContent}
              syntaxStyle={syntaxStyle}
              conceal={true}
              tableOptions={tableOptions}
              renderNode={renderCodeBlockNode}
            />
          )}
        </scrollbox>
      )}
      <EditorAiModal
        isOpen={isAiModalOpen && aiConfigured}
        onClose={() => setIsAiModalOpen(false)}
        isEditing={isEditing}
        getCurrentContent={() =>
          isEditing && textareaRef.current
            ? textareaRef.current.plainText
            : activeNote?.content || ""
        }
        onApplyContent={applyAiContent}
      />
      <EditorHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />
      <EditorLocalGraphModal
        isOpen={isLocalGraphOpen}
        onClose={() => setIsLocalGraphOpen(false)}
        activeNote={activeNote}
      />
      <EditorWikilinkPickerModal
        isOpen={isWikilinkPickerOpen}
        onClose={() => setIsWikilinkPickerOpen(false)}
        onInsertWikilink={handleInsertWikilink}
      />
      <EditorAttachFileModal
        isOpen={isAttachFileModalOpen}
        onClose={() => setIsAttachFileModalOpen(false)}
        onInsertAttachment={handleInsertAttachment}
        noteTitle={rawTitle}
      />
      <EditorAttachmentsModal
        isOpen={isAttachmentsListOpen}
        onClose={() => setIsAttachmentsListOpen(false)}
        attachments={noteAttachments}
        noteTitle={rawTitle}
      />
    </box>
  );
}
