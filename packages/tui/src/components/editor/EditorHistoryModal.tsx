import React, { useState, useEffect, useRef } from "react";
import { useAppStore } from "../../store";
import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import { getTreeSitterClient } from "@opentui/core";
import type { GitCommitInfo } from "@lyratui/core";
import { useTranslation } from "../../i18n";
import { useTheme, getScrollbarOptions } from "../../theme";
import { createEditorSyntaxStyle, detectFiletype } from "./syntax";
import { cleanMarkdownForDisplay } from "./cleaner";
import { createCodeBlockRenderer } from "./CodeBlockRenderer";
import { scrollIndexIntoView } from "../../utils/scrollHelper";
import { MarqueeText } from "../MarqueeText";
import { EditorPreviewSkeleton } from "./EditorPreviewSkeleton";
import { EditorRevisionsSkeleton } from "./EditorRevisionsSkeleton";

export interface EditorHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EditorHistoryModal({
  isOpen,
  onClose,
}: EditorHistoryModalProps): any {
  const theme = useTheme();
  const activeNote = useAppStore((s) => s.activeNote);
  const isGitActiveAction = useAppStore((s) => s.isGitActiveAction);
  const getNoteHistoryAction = useAppStore((s) => s.getNoteHistoryAction);
  const getNoteContentAtCommitAction = useAppStore(
    (s) => s.getNoteContentAtCommitAction,
  );
  const restoreNoteVersionAction = useAppStore(
    (s) => s.restoreNoteVersionAction,
  );
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const { t, keys } = useTranslation();
  const renderer = useRenderer();
  const { width: termWidth = 100 } = useTerminalDimensions?.() || {
    width: 100,
  };

  const [isGitActive, setIsGitActive] = useState<boolean>(true);
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({});
  const [isConfirmingRestore, setIsConfirmingRestore] =
    useState<boolean>(false);
  const [focusPane, setFocusPane] = useState<"list" | "preview">("list");

  const previewScrollRef = useRef<any>(null);
  const commitsScrollRef = useRef<any>(null);

  useEffect(() => {
    if (commitsScrollRef.current && commits.length > 0 && selectedIndex >= 0) {
      let top = 0;
      for (let i = 0; i < selectedIndex; i++) {
        const c = commits[i];
        const authorLines = c?.author ? 1 : 0;
        const h = 2 + 1 + 1 + authorLines + 1;
        top += h;
      }
      const cur = commits[selectedIndex];
      const curAuthorLines = cur?.author ? 1 : 0;
      const currentHeight = 2 + 1 + 1 + curAuthorLines + 1;

      scrollIndexIntoView(
        commitsScrollRef.current,
        { top, height: currentHeight },
        currentHeight,
        commits.length,
        selectedIndex,
        1,
      );
    }
  }, [selectedIndex, commits]);

  const syntaxStyle = React.useMemo(
    () => createEditorSyntaxStyle(theme),
    [theme],
  );

  const renderCodeBlockNode = React.useMemo(
    () => createCodeBlockRenderer(renderer, syntaxStyle, theme),
    [renderer, syntaxStyle, theme],
  );

  const tableOptions = React.useMemo(
    () =>
      ({
        style: "grid",
        borderStyle: "rounded",
        borderColor: theme.border.default,
        cellPaddingX: 1,
      }) as const,
    [theme],
  );

  const loadCommitPreview = async (
    commitHash: string,
    folderName: string,
    filename: string,
    cache: Record<string, string>,
  ) => {
    if (cache[commitHash] !== undefined) {
      setPreviewContent(cache[commitHash]);
      setIsLoadingPreview(false);
      return;
    }

    setIsLoadingPreview(true);
    try {
      const content = await getNoteContentAtCommitAction(
        folderName,
        filename,
        commitHash,
      );
      setPreviewCache((prev) => ({ ...prev, [commitHash]: content }));
      setPreviewContent(content);
    } catch (err) {
      console.error("Failed to load note content at commit preview:", err);
      setPreviewContent("");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !activeNote) return;

    let isMounted = true;
    setIsLoadingHistory(true);
    setSelectedIndex(0);
    setPreviewContent("");
    setIsConfirmingRestore(false);
    setFocusPane("list");

    (async () => {
      const gitActive = await isGitActiveAction();
      if (!isMounted) return;
      setIsGitActive(gitActive);
      if (!gitActive) {
        setCommits([]);
        setIsLoadingHistory(false);
        return;
      }
      const list = await getNoteHistoryAction(
        activeNote.folderName,
        activeNote.filename,
      );
      if (!isMounted) return;
      setCommits(list);
      setIsLoadingHistory(false);
      if (list.length > 0) {
        void loadCommitPreview(
          list[0].hash,
          activeNote.folderName,
          activeNote.filename,
          previewCache,
        );
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeNote?.filename, activeNote?.folderName]);

  const handleSelectCommit = (idx: number) => {
    if (commits.length === 0) return;
    const clamped = Math.max(0, Math.min(idx, commits.length - 1));
    setSelectedIndex(clamped);
    const item = commits[clamped];
    if (item && activeNote) {
      void loadCommitPreview(
        item.hash,
        activeNote.folderName,
        activeNote.filename,
        previewCache,
      );
    }
  };

  const handleRestore = async () => {
    if (!activeNote || commits.length === 0) return;
    const selected = commits[selectedIndex];
    if (!selected) return;

    const shortHash = selected.hash.slice(0, 7);
    try {
      const success = await restoreNoteVersionAction(
        activeNote.folderName,
        activeNote.filename,
        selected.hash,
      );
      if (success) {
        setStatusMessage(
          t(keys.EDITOR_HISTORY_RESTORE_SUCCESS, { hash: shortHash }),
        );
        onClose();
      } else {
        setStatusMessage(
          t(keys.EDITOR_HISTORY_RESTORE_FAILED, { error: "Unknown error" }),
        );
      }
    } catch (err: any) {
      console.error("Failed to restore note version at commit:", err);
      setStatusMessage(
        t(keys.EDITOR_HISTORY_RESTORE_FAILED, { error: err.message }),
      );
    } finally {
      setIsConfirmingRestore(false);
    }
  };

  useKeyboard((key) => {
    if (!isOpen) return;

    if (key.name === "escape") {
      key.preventDefault?.();
      if (isConfirmingRestore) {
        setIsConfirmingRestore(false);
      } else {
        onClose();
      }
      return;
    }

    if (isConfirmingRestore) {
      if (
        key.name === "return" ||
        key.name === "y" ||
        (key.name as any) === "Y"
      ) {
        key.preventDefault?.();
        void handleRestore();
        return;
      }
      if (key.name === "n" || (key.name as any) === "N") {
        key.preventDefault?.();
        setIsConfirmingRestore(false);
        return;
      }
      return;
    }

    if (key.name === "tab") {
      key.preventDefault?.();
      setFocusPane((prev) => (prev === "list" ? "preview" : "list"));
      return;
    }

    if (focusPane === "list") {
      if (key.name === "up" || key.name === "k") {
        key.preventDefault?.();
        handleSelectCommit(selectedIndex - 1);
        return;
      }
      if (key.name === "down" || key.name === "j") {
        key.preventDefault?.();
        handleSelectCommit(selectedIndex + 1);
        return;
      }
      if (key.name === "home" || key.name === "g") {
        key.preventDefault?.();
        handleSelectCommit(0);
        return;
      }
      if (key.name === "end" || (key.name === "g" && key.shift)) {
        key.preventDefault?.();
        handleSelectCommit(commits.length - 1);
        return;
      }
    }

    if (focusPane === "preview" && previewScrollRef.current) {
      if (key.name === "up" || key.name === "k") {
        key.preventDefault?.();
        try {
          previewScrollRef.current.scrollBy?.({ y: -3, x: 0 });
        } catch (err) {
          console.error("Failed to scroll preview up:", err);
        }
        return;
      }
      if (key.name === "down" || key.name === "j") {
        key.preventDefault?.();
        try {
          previewScrollRef.current.scrollBy?.({ y: 3, x: 0 });
        } catch (err) {
          console.error("Failed to scroll preview down:", err);
        }
        return;
      }
      if (key.name === "pageup") {
        key.preventDefault?.();
        try {
          previewScrollRef.current.scrollBy?.({ y: -10, x: 0 });
        } catch (err) {
          console.error("Failed to scroll preview page up:", err);
        }
        return;
      }
      if (key.name === "pagedown" || key.name === "space") {
        key.preventDefault?.();
        try {
          previewScrollRef.current.scrollBy?.({ y: 10, x: 0 });
        } catch (err) {
          console.error("Failed to scroll preview page down:", err);
        }
        return;
      }
    }

    if (key.name === "r" || key.name === "R") {
      key.preventDefault?.();
      if (commits.length > 0) {
        setIsConfirmingRestore(true);
      }
      return;
    }

    if (key.name === "return") {
      key.preventDefault?.();
      if (commits.length > 0) {
        setIsConfirmingRestore(true);
      }
      return;
    }
  });

  if (!isOpen) return null;

  const currentCommit = commits[selectedIndex];
  const codeFiletype = activeNote ? detectFiletype(activeNote.filename) : null;
  const displayContent = cleanMarkdownForDisplay(previewContent || "");

  const formatDateCompact = (dateStr: string, timestamp?: number) => {
    if (timestamp) {
      const d = new Date(timestamp);
      const pad = (n: number) => n.toString().padStart(2, "0");
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hours = pad(d.getHours());
      const mins = pad(d.getMinutes());
      return `${month}/${day} ${hours}:${mins}`;
    }
    if (dateStr) {
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const pad = (n: number) => n.toString().padStart(2, "0");
          return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
      } catch {}
      return dateStr.slice(0, 16);
    }
    return "";
  };

  const formatFullDate = (dateStr: string, timestamp?: number) => {
    if (timestamp) {
      const d = new Date(timestamp);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    }
    return dateStr;
  };

  const modalWidth = Math.floor(termWidth * 0.8);
  const leftPaneWidth = Math.min(
    36,
    Math.max(28, Math.floor(modalWidth * 0.35)),
  );
  const cardInnerWidth = Math.max(16, leftPaneWidth - 10);
  const previewInnerWidth = Math.max(20, modalWidth - leftPaneWidth - 8);

  return (
    <box
      position="absolute"
      top={2}
      left="10%"
      width="80%"
      height="90%"
      borderStyle="rounded"
      borderColor={theme.accent.secondary}
      flexDirection="column"
      padding={1}
      backgroundColor={theme.bg.panel}
    >
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        marginBottom={1}
        flexShrink={0}
      >
        <box flexDirection="row" gap={1} alignItems="center" flexShrink={1}>
          <text
            fg={theme.accent.secondary}
          >{`📖 ${t(keys.EDITOR_HISTORY_TITLE)}`}</text>
          {activeNote ? (
            <box flexDirection="row" alignItems="center">
              <text fg={theme.text.muted}>{'— "'}</text>
              <MarqueeText
                text={activeNote.title || activeNote.filename}
                maxLength={Math.max(16, modalWidth - 45)}
                isSelected={false}
                isFocused={false}
                fg={theme.text.muted}
              />
              <text fg={theme.text.muted}>{'"'}</text>
            </box>
          ) : null}
        </box>
        <text fg={theme.text.dim}>{t(keys.EDITOR_HISTORY_CLOSE_HINT)}</text>
      </box>

      {!isGitActive && !isLoadingHistory ? (
        <box
          flexGrow={1}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          padding={2}
          gap={1}
        >
          <text fg={theme.accent.red}>
            {t(keys.EDITOR_HISTORY_GIT_MISSING)}
          </text>
          <text fg={theme.text.dim}>
            {t(keys.EDITOR_HISTORY_GIT_MISSING_HINT)}
          </text>
        </box>
      ) : !isLoadingHistory && commits.length === 0 ? (
        <box
          flexGrow={1}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          padding={2}
          gap={1}
        >
          <text fg={theme.text.muted}>{t(keys.EDITOR_HISTORY_EMPTY)}</text>
          <text fg={theme.text.dim}>{t(keys.EDITOR_HISTORY_EMPTY_HINT)}</text>
        </box>
      ) : isLoadingHistory ? (
        <box flexDirection="row" flexGrow={1} gap={1} width="100%">
          <box
            width={leftPaneWidth}
            flexShrink={0}
            height="100%"
            flexDirection="column"
            borderStyle="rounded"
            borderColor={theme.border.subtle}
            padding={1}
            backgroundColor={theme.bg.app}
          >
            <box
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              marginBottom={1}
            >
              <text fg={theme.accent.primary}>
                {t(keys.EDITOR_HISTORY_REVISIONS_TITLE)}
              </text>
              <text fg={theme.text.dim}>{t(keys.EDITOR_HISTORY_LOADING)}</text>
            </box>
            <EditorRevisionsSkeleton theme={theme} count={4} />
          </box>

          <box
            flexGrow={1}
            height="100%"
            flexDirection="column"
            borderStyle="rounded"
            borderColor={theme.border.subtle}
            padding={1}
            backgroundColor={theme.bg.panelAlt}
          >
            <box
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              marginBottom={1}
            >
              <text fg={theme.accent.secondary}>
                {`🔍 ${t(keys.EDITOR_HISTORY_PREVIEW)}`}
              </text>
              <text fg={theme.text.dim}>{t(keys.EDITOR_HISTORY_LOADING)}</text>
            </box>
            <EditorPreviewSkeleton theme={theme} />
          </box>
        </box>
      ) : (
        <box flexDirection="row" flexGrow={1} gap={1} width="100%">
          <box
            width={leftPaneWidth}
            flexShrink={0}
            height="100%"
            flexDirection="column"
            borderStyle="rounded"
            borderColor={
              focusPane === "list"
                ? theme.accent.secondary
                : theme.border.subtle
            }
            padding={1}
            backgroundColor={theme.bg.app}
          >
            <box
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              marginBottom={1}
            >
              <text fg={theme.accent.primary}>
                {t(keys.EDITOR_HISTORY_REVISIONS_COUNT, {
                  count: commits.length,
                })}
              </text>
              <text fg={theme.text.dim}>
                {focusPane === "list" ? t(keys.EDITOR_HISTORY_FOCUSED) : ""}
              </text>
            </box>

            <scrollbox
              ref={commitsScrollRef}
              flexGrow={1}
              scrollY={true}
              scrollX={false}
              verticalScrollbarOptions={getScrollbarOptions(
                theme,
                focusPane === "list",
              )}
            >
              {commits.map((commit, idx) => {
                const isSelected = selectedIndex === idx;
                const shortHash = commit.hash.slice(0, 7);
                const prefix = isSelected ? "▸ " : "  ";
                const dateLabel = formatDateCompact(
                  commit.date,
                  commit.timestamp,
                );

                return (
                  <box
                    key={commit.hash || idx}
                    flexDirection="column"
                    paddingLeft={1}
                    paddingRight={1}
                    paddingTop={0}
                    paddingBottom={0}
                    marginBottom={1}
                    borderStyle="rounded"
                    borderColor={
                      isSelected ? theme.accent.secondary : theme.border.subtle
                    }
                    backgroundColor={isSelected ? theme.bg.selected : undefined}
                  >
                    <box
                      flexDirection="row"
                      justifyContent="space-between"
                      alignItems="center"
                      width="100%"
                    >
                      <text
                        fg={
                          isSelected
                            ? theme.accent.secondary
                            : theme.text.primary
                        }
                      >
                        {`${prefix}${shortHash}`}
                      </text>
                      <text fg={theme.text.dim}>{dateLabel}</text>
                    </box>

                    <box flexDirection="row" width="100%">
                      <MarqueeText
                        text={
                          commit.message || t(keys.EDITOR_HISTORY_DEFAULT_MSG)
                        }
                        maxLength={cardInnerWidth}
                        isSelected={isSelected}
                        isFocused={focusPane === "list"}
                        fg={
                          isSelected
                            ? theme.text.highlight
                            : theme.text.secondary
                        }
                      />
                    </box>

                    {commit.author ? (
                      <box flexDirection="row" width="100%">
                        <MarqueeText
                          text={t(keys.EDITOR_HISTORY_BY_AUTHOR, {
                            author: commit.author,
                          })}
                          maxLength={cardInnerWidth}
                          isSelected={isSelected}
                          isFocused={focusPane === "list"}
                          fg={theme.text.dim}
                        />
                      </box>
                    ) : null}
                  </box>
                );
              })}
            </scrollbox>
          </box>

          <box
            flexGrow={1}
            height="100%"
            flexDirection="column"
            borderStyle="rounded"
            borderColor={
              focusPane === "preview"
                ? theme.accent.secondary
                : theme.border.subtle
            }
            padding={1}
            backgroundColor={theme.bg.panelAlt}
          >
            <box
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              flexShrink={0}
              marginBottom={1}
            >
              <box flexDirection="row" gap={1} alignItems="center">
                <text fg={theme.accent.secondary}>
                  {`🔍 ${t(keys.EDITOR_HISTORY_PREVIEW)}`}
                </text>
                {currentCommit ? (
                  <text fg={theme.accent.cyan}>
                    {`[${currentCommit.hash.slice(0, 7)}]`}
                  </text>
                ) : null}
              </box>
              {currentCommit ? (
                <text fg={theme.text.dim}>
                  {formatDateCompact(
                    currentCommit.date,
                    currentCommit.timestamp,
                  )}
                </text>
              ) : null}
            </box>

            {isLoadingPreview ? (
              <EditorPreviewSkeleton theme={theme} />
            ) : (
              <scrollbox
                ref={previewScrollRef}
                key={`${currentCommit?.hash}:${previewContent.length}`}
                flexGrow={1}
                scrollY={true}
                scrollX={false}
                paddingLeft={1}
                paddingRight={1}
                verticalScrollbarOptions={getScrollbarOptions(
                  theme,
                  focusPane === "preview",
                )}
              >
                {codeFiletype ? (
                  <code
                    content={previewContent || ""}
                    filetype={codeFiletype}
                    syntaxStyle={syntaxStyle}
                    treeSitterClient={getTreeSitterClient()}
                    drawUnstyledText={true}
                    wrapMode="word"
                  />
                ) : (
                  <markdown
                    content={
                      displayContent || t(keys.EDITOR_HISTORY_EMPTY_FILE)
                    }
                    syntaxStyle={syntaxStyle}
                    conceal={true}
                    tableOptions={tableOptions}
                    renderNode={renderCodeBlockNode}
                  />
                )}
              </scrollbox>
            )}
          </box>
        </box>
      )}

      {isConfirmingRestore && currentCommit ? (
        <box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          marginTop={1}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={1}
          paddingRight={1}
          borderStyle="rounded"
          borderColor={theme.accent.green}
          backgroundColor={theme.bg.selected}
        >
          <text fg={theme.accent.green}>
            {t(keys.EDITOR_HISTORY_RESTORE_CONFIRM, {
              hash: currentCommit.hash.slice(0, 7),
              date: formatFullDate(currentCommit.date, currentCommit.timestamp),
            })}
          </text>
          <box flexDirection="row" gap={2} alignItems="center">
            <text fg={theme.text.dim}>{t(keys.EDITOR_HISTORY_CANCEL_BTN)}</text>
            <text fg={theme.accent.green}>
              {t(keys.EDITOR_HISTORY_CONFIRM_BTN)}
            </text>
          </box>
        </box>
      ) : (
        <box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          marginTop={1}
          paddingTop={1}
          borderStyle="single"
          borderColor={theme.border.subtle}
        >
          <text fg={theme.text.muted}>
            {t(keys.EDITOR_HISTORY_SELECT_HINT)}
          </text>
          {commits.length > 0 ? (
            <text fg={theme.accent.green}>
              {t(keys.EDITOR_HISTORY_RESTORE_BTN)}
            </text>
          ) : null}
        </box>
      )}
    </box>
  );
}
