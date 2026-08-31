import React, { useState, useEffect, useRef } from "react";
import { useAppStore } from "../../store";
import { useKeyboard } from "@opentui/react";
import { useBindings } from "@opentui/keymap/react";
import {
  EditorAiService,
  hasConfiguredProvider,
  resolveAiModel,
} from "@lyratui/core";
import { useTranslation } from "../../i18n";
import { useTheme, getScrollbarOptions } from "../../theme";
import { scrollIndexIntoView } from "../../utils/scrollHelper";

export interface EditorAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  isEditing?: boolean;
  getCurrentContent?: () => string;
  onApplyContent?: (
    newContent: string,
    mode: "replace" | "append" | "cursor",
  ) => Promise<void>;
}

type AiActionType =
  | "custom"
  | "rewrite"
  | "continue"
  | "improve"
  | "fix_spelling"
  | "translate"
  | "summarize"
  | "expand"
  | "simplify"
  | "make_informal"
  | "make_formal"
  | "extract_todos";

export function EditorAiModal({
  isOpen,
  onClose,
  isEditing,
  getCurrentContent,
  onApplyContent,
}: EditorAiModalProps): any {
  const theme = useTheme();
  const activeNote = useAppStore((s) => s.activeNote);
  const saveNoteContent = useAppStore((s) => s.saveNoteContent);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const copyToClipboard = useAppStore((s) => s.copyToClipboard);
  const { t, keys, locale } = useTranslation();
  const aiConfigured = hasConfiguredProvider();

  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [rewriteInstructions, setRewriteInstructions] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [currentAction, setCurrentAction] = useState<
    "menu" | "rewrite_prompt" | "result"
  >("menu");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [resultText, setResultText] = useState<string>("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [actionDoneMsg, setActionDoneMsg] = useState<string>("");

  const inputRef = useRef<any>(null);
  const scrollboxRef = useRef<any>(null);
  const resolved = resolveAiModel({ language: locale as any });
  const modelName = resolved.modelName;

  const applyContent = async (
    newContent: string,
    mode: "replace" | "append" | "cursor" = "replace",
  ) => {
    if (onApplyContent) {
      await onApplyContent(newContent, mode);
    } else {
      if (mode === "append") {
        const base = activeNote?.content || "";
        const updated = `${base.trimEnd()}\n\n${newContent.trim()}\n`;
        await saveNoteContent(updated);
      } else {
        await saveNoteContent(newContent);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCustomPrompt("");
      setRewriteInstructions("");
      setCurrentAction("menu");
      setSelectedIndex(0);
      setIsLoading(false);
      setResultText("");
      setErrorText(null);
      setActionDoneMsg("");
    }
  }, [isOpen]);

  const executeAction = async (
    action: AiActionType,
    promptOverride?: string,
  ) => {
    const rawContent = getCurrentContent
      ? getCurrentContent()
      : activeNote?.content || "";
    if (!rawContent && action !== "custom") return;
    setCurrentAction("result");
    setIsLoading(true);
    setErrorText(null);
    setResultText("");

    const editorAi = new EditorAiService();
    const opts = { language: locale as any };
    const content = rawContent;

    try {
      if (action === "custom") {
        const p = promptOverride || customPrompt;
        if (!p.trim()) return;
        const res = await editorAi.customInstruction(content, p, opts);
        setResultText(res);
        setActionDoneMsg(t(keys.EDITOR_AI_MSG_CUSTOM_DONE));
      } else if (action === "rewrite") {
        const res = await editorAi.rewrite(content, promptOverride, opts);
        setResultText(res);
        setActionDoneMsg(t(keys.EDITOR_AI_MSG_REWRITE_DONE));
      } else if (action === "continue") {
        const res = await editorAi.continueWriting(content, opts);
        setResultText(res);
        setActionDoneMsg(t(keys.EDITOR_AI_MSG_CONTINUE_DONE));
      } else if (action === "improve") {
        const res = await editorAi.improveWriting(content, opts);
        setResultText(res);
        setActionDoneMsg(t(keys.EDITOR_AI_MSG_IMPROVE_DONE));
      } else if (action === "fix_spelling") {
        const res = await editorAi.fixSpelling(content, opts);
        setResultText(res);
        setActionDoneMsg(t(keys.EDITOR_AI_MSG_SPELLING_DONE));
      } else if (action === "translate") {
        const targetLang = locale === "it" ? "English" : "Italian";
        const res = await editorAi.translateText(content, targetLang, opts);
        setResultText(res);
        setActionDoneMsg(
          t(keys.EDITOR_AI_MSG_TRANSLATE_DONE, { lang: targetLang }),
        );
      } else if (action === "summarize") {
        const res = await editorAi.summarizeNote(content, opts);
        setResultText(res);
        setActionDoneMsg(t(keys.EDITOR_AI_MSG_SUMMARIZE_DONE));
      } else if (action === "expand") {
        const res = await editorAi.expandText(content, opts);
        setResultText(res);
        setActionDoneMsg(t(keys.EDITOR_AI_MSG_EXPAND_DONE));
      } else if (action === "simplify") {
        const res = await editorAi.simplifyText(content, opts);
        setResultText(res);
        setActionDoneMsg(t(keys.EDITOR_AI_MSG_SIMPLIFY_DONE));
      } else if (action === "make_informal") {
        const res = await editorAi.changeTone(content, "informal", opts);
        setResultText(res);
        setActionDoneMsg(t(keys.EDITOR_AI_MSG_INFORMAL_DONE));
      } else if (action === "make_formal") {
        const res = await editorAi.changeTone(content, "formal", opts);
        setResultText(res);
        setActionDoneMsg(t(keys.EDITOR_AI_MSG_FORMAL_DONE));
      } else if (action === "extract_todos") {
        const todos = await editorAi.extractTodos(content, opts);
        if (todos.length === 0) {
          setResultText(t(keys.EDITOR_AI_NO_TODOS_FOUND));
          setActionDoneMsg(t(keys.EDITOR_AI_MSG_NO_TODOS));
        } else {
          const formatted = `## Action Items\n${todos.join("\n")}`;
          setResultText(formatted);
          setActionDoneMsg(
            t(keys.EDITOR_AI_MSG_TODOS_EXTRACTED, { count: todos.length }),
          );
        }
      }
    } catch (err: any) {
      console.error("AI action failed in EditorAiModal:", err);
      setErrorText(err?.message || "AI action failed");
    } finally {
      setIsLoading(false);
    }
  };

  const menuItems: Array<{
    id: AiActionType;
    icon: string;
    label: string;
  }> = [
    {
      id: "rewrite",
      icon: "✎",
      label: t(keys.EDITOR_AI_REWRITE),
    },
    {
      id: "continue",
      icon: "›",
      label: t(keys.EDITOR_AI_CONTINUE),
    },
    {
      id: "improve",
      icon: "T",
      label: t(keys.EDITOR_AI_IMPROVE),
    },
    {
      id: "fix_spelling",
      icon: "✓",
      label: t(keys.EDITOR_AI_FIX_SPELLING),
    },
    {
      id: "translate",
      icon: "Tr",
      label: t(keys.EDITOR_AI_TRANSLATE),
    },
    {
      id: "summarize",
      icon: "S",
      label: t(keys.EDITOR_AI_SUMMARIZE),
    },
    {
      id: "expand",
      icon: "+",
      label: t(keys.EDITOR_AI_EXPAND),
    },
    {
      id: "simplify",
      icon: "-",
      label: t(keys.EDITOR_AI_SIMPLIFY),
    },
    {
      id: "make_informal",
      icon: "~",
      label: t(keys.EDITOR_AI_MAKE_INFORMAL),
    },
    {
      id: "make_formal",
      icon: "^",
      label: t(keys.EDITOR_AI_MAKE_FORMAL),
    },
    {
      id: "extract_todos",
      icon: "[]",
      label: t(keys.EDITOR_AI_TODOS),
    },
  ];

  useEffect(() => {
    if (scrollboxRef.current && menuItems.length > 0 && selectedIndex >= 0) {
      scrollIndexIntoView(
        scrollboxRef.current,
        selectedIndex,
        1,
        menuItems.length,
        selectedIndex,
      );
    }
  }, [selectedIndex, menuItems.length]);

  useBindings(
    () => ({
      priority: 100,
      enabled: isOpen && aiConfigured && currentAction === "menu",
      commands: [
        {
          name: "ai.menu.previous",
          run: () => {
            setSelectedIndex((prev) =>
              prev > 0 ? prev - 1 : menuItems.length - 1,
            );
          },
        },
        {
          name: "ai.menu.next",
          run: () => {
            setSelectedIndex((prev) =>
              prev < menuItems.length - 1 ? prev + 1 : 0,
            );
          },
        },
        {
          name: "ai.menu.execute",
          run: () => {
            if (customPrompt.trim().length > 0) {
              void executeAction("custom", customPrompt);
            } else {
              const item = menuItems[selectedIndex];
              if (item?.id === "rewrite") {
                setRewriteInstructions("");
                setCurrentAction("rewrite_prompt");
              } else if (item) {
                void executeAction(item.id);
              }
            }
          },
        },
        {
          name: "ai.menu.close",
          run: onClose,
        },
      ],
      bindings: [
        {
          key: "up, ctrl+k, ctrl+p",
          cmd: "ai.menu.previous",
          desc: "Previous AI option",
        },
        {
          key: "down, ctrl+j, ctrl+n, tab",
          cmd: "ai.menu.next",
          desc: "Next AI option",
        },
        {
          key: "shift+tab",
          cmd: "ai.menu.previous",
          desc: "Previous AI option",
        },
        {
          key: "return",
          cmd: "ai.menu.execute",
          desc: "Execute AI option",
        },
        {
          key: "escape",
          cmd: "ai.menu.close",
          desc: "Close AI assistant",
        },
      ],
    }),
    [
      isOpen,
      aiConfigured,
      currentAction,
      customPrompt,
      selectedIndex,
      menuItems,
      onClose,
    ],
  );

  useBindings(
    () => ({
      priority: 100,
      enabled: isOpen && aiConfigured && currentAction === "rewrite_prompt",
      commands: [
        {
          name: "ai.rewrite.execute",
          run: () => {
            void executeAction("rewrite", rewriteInstructions);
          },
        },
        {
          name: "ai.rewrite.back",
          run: () => {
            setCurrentAction("menu");
          },
        },
      ],
      bindings: [
        {
          key: "return",
          cmd: "ai.rewrite.execute",
          desc: "Execute rewrite",
        },
        {
          key: "escape",
          cmd: "ai.rewrite.back",
          desc: "Back to AI menu",
        },
      ],
    }),
    [isOpen, aiConfigured, currentAction, rewriteInstructions],
  );

  useKeyboard((key) => {
    if (!isOpen) return;

    if (key.name === "escape") {
      key.preventDefault?.();
      if (currentAction === "rewrite_prompt") {
        setCurrentAction("menu");
      } else {
        onClose();
      }
      return;
    }

    if (resultText && !isLoading) {
      if (key.name === "i" || key.name === "I") {
        key.preventDefault?.();
        void applyContent(resultText, "replace");
        setStatusMessage(actionDoneMsg || t(keys.EDITOR_AI_STATUS_APPLIED));
        onClose();
        return;
      }
      if (key.name === "e" || key.name === "E") {
        key.preventDefault?.();
        void applyContent(resultText, "append");
        setStatusMessage(t(keys.EDITOR_AI_STATUS_APPENDED));
        onClose();
        return;
      }
      if (key.name === "a" || key.name === "A") {
        key.preventDefault?.();
        void applyContent(resultText, "cursor");
        setStatusMessage(t(keys.EDITOR_AI_STATUS_CURSOR));
        onClose();
        return;
      }
      if (key.name === "c" || key.name === "C") {
        key.preventDefault?.();
        void copyToClipboard(resultText);
        setStatusMessage(t(keys.EDITOR_AI_STATUS_COPIED));
        onClose();
        return;
      }
    }
  });

  if (!isOpen || !aiConfigured) return null;

  return (
    <box
      position="absolute"
      top={3}
      left="14%"
      width="72%"
      height={22}
      borderStyle="rounded"
      borderColor={theme.accent.purple}
      flexDirection="column"
      padding={1}
      backgroundColor={theme.bg.panel}
    >
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        marginBottom={1}
      >
        <box flexDirection="row" gap={1} alignItems="center">
          <text fg={theme.accent.purple}>
            {currentAction === "rewrite_prompt"
              ? t(keys.EDITOR_AI_REWRITE_TITLE)
              : t(keys.EDITOR_AI_TITLE)}
          </text>
          <text fg={theme.text.dim}>{`(${modelName})`}</text>
        </box>
        <text fg={theme.text.dim}>
          {currentAction === "rewrite_prompt"
            ? "[Esc: Back]"
            : t(keys.EDITOR_AI_CLOSE_HINT)}
        </text>
      </box>

      {currentAction === "menu" ? (
        <box flexDirection="column" flexGrow={1}>
          <box
            borderStyle="rounded"
            borderColor={theme.border.default}
            paddingLeft={1}
            marginBottom={1}
            backgroundColor={theme.bg.input}
          >
            <input
              ref={inputRef}
              focused={true}
              value={customPrompt}
              onInput={(val: string) => setCustomPrompt(val)}
              placeholder={t(keys.EDITOR_AI_INPUT_PLACEHOLDER)}
            />
          </box>

          <scrollbox
            ref={scrollboxRef}
            flexGrow={1}
            verticalScrollbarOptions={getScrollbarOptions(theme, true)}
          >
            {menuItems.map((item, idx) => {
              const isSelected = selectedIndex === idx && !customPrompt.trim();
              return (
                <box
                  key={item.id}
                  flexDirection="row"
                  justifyContent="space-between"
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={isSelected ? theme.bg.aiPrompt : undefined}
                >
                  <text
                    fg={
                      isSelected
                        ? theme.accent.purpleLight
                        : theme.text.secondary
                    }
                  >
                    <span fg={theme.accent.purple}>{`${item.icon} `}</span>
                    {item.label}
                  </text>
                  <text fg={theme.text.dim}>{isSelected ? "↵ Enter" : ""}</text>
                </box>
              );
            })}
          </scrollbox>
        </box>
      ) : currentAction === "rewrite_prompt" ? (
        <box flexDirection="column" flexGrow={1} justifyContent="space-between">
          <box flexDirection="column">
            <text fg={theme.text.secondary} marginBottom={1}>
              {t(keys.EDITOR_AI_REWRITE_PROMPT)}
            </text>
            <box
              borderStyle="rounded"
              borderColor={theme.border.default}
              paddingLeft={1}
              marginBottom={1}
              backgroundColor={theme.bg.input}
            >
              <input
                focused={true}
                value={rewriteInstructions}
                onInput={(val: string) => setRewriteInstructions(val)}
                placeholder={t(keys.EDITOR_AI_REWRITE_PLACEHOLDER)}
              />
            </box>
          </box>

          <box
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <text fg={theme.text.dim}>[Esc] Back</text>
            <text fg={theme.accent.purple}>
              {t(keys.EDITOR_AI_REWRITE_BTN)}
            </text>
          </box>
        </box>
      ) : (
        <box flexDirection="column" flexGrow={1}>
          {isLoading ? (
            <box padding={1} flexDirection="column" gap={1}>
              <text fg={theme.accent.purple}>
                {t(keys.EDITOR_AI_THINKING_PROCESSING, { model: modelName })}
              </text>
            </box>
          ) : errorText ? (
            <box padding={1} flexDirection="column" gap={1}>
              <text fg={theme.text.error}>
                {t(keys.EDITOR_AI_ERROR_PREFIX, { error: errorText })}
              </text>
            </box>
          ) : (
            <box flexDirection="column" flexGrow={1}>
              <scrollbox
                flexGrow={1}
                height={12}
                borderStyle="rounded"
                borderColor={theme.border.aiDeep}
                padding={1}
                marginBottom={1}
                backgroundColor={theme.bg.aiBanner}
                verticalScrollbarOptions={getScrollbarOptions(theme, true)}
              >
                <text fg={theme.text.highlight}>{resultText}</text>
              </scrollbox>

              <box flexDirection="row" gap={2} alignItems="center">
                <text fg={theme.accent.green}>
                  {t(keys.EDITOR_AI_BTN_APPLY)}
                </text>
                <text fg={theme.accent.cyan}>
                  {t(keys.EDITOR_AI_BTN_APPEND)}
                </text>
                {isEditing ? (
                  <text fg={theme.accent.yellow}>
                    {t(keys.EDITOR_AI_BTN_CURSOR)}
                  </text>
                ) : null}
                <text fg={theme.accent.secondary}>
                  {t(keys.EDITOR_AI_BTN_COPY)}
                </text>
                <text fg={theme.text.dim}>{t(keys.EDITOR_AI_BTN_DISMISS)}</text>
              </box>
            </box>
          )}
        </box>
      )}
    </box>
  );
}
