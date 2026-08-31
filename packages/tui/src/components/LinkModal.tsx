import React, { useState, useEffect } from "react";
import { useAppStore } from "../store";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "../i18n";
import { useTheme } from "../theme";
import { autofillLink, hasConfiguredProvider } from "@lyratui/core";

export function LinkModal(): any {
  const theme = useTheme();
  const linkModalOpen = useAppStore((s) => s.linkModalOpen);
  const setLinkModalOpen = useAppStore((s) => s.setLinkModalOpen);
  const addLinkAction = useAppStore((s) => s.addLinkAction);
  const isCommandPaletteOpen = useAppStore((s) => s.isCommandPaletteOpen);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const { t, keys, locale } = useTranslation();
  const aiConfigured = hasConfiguredProvider();

  const [urlVal, setUrlVal] = useState<string>("");
  const [titleVal, setTitleVal] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [activeField, setActiveField] = useState<"url" | "title">("url");
  const [isAutofilling, setIsAutofilling] = useState<boolean>(false);

  useEffect(() => {
    if (linkModalOpen) {
      setUrlVal("");
      setTitleVal("");
      setDescription("");
      setTags([]);
      setActiveField("url");
      setIsAutofilling(false);
    }
  }, [linkModalOpen]);

  const handleAutofill = async () => {
    if (!aiConfigured) return;
    let url = urlVal.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }
    setIsAutofilling(true);
    try {
      const res = await autofillLink(url, { language: locale as any });
      if (res.title) {
        setTitleVal(res.title);
      }
      setDescription(res.description);
      setTags(res.tags);
      setStatusMessage(t(keys.STATUS_LINK_AUTOFILL_SUCCESS));
    } catch (err: any) {
      console.error("Failed to autofill link metadata in LinkModal:", err);
      setStatusMessage(
        t(keys.STATUS_LINK_AUTOFILL_FAILED, { error: err?.message }),
      );
    } finally {
      setIsAutofilling(false);
    }
  };

  const submit = async () => {
    let url = urlVal.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }
    const title = titleVal.trim() || url;
    setLinkModalOpen(false);
    await addLinkAction({ url, title, description, tags });
  };

  useKeyboard(async (key) => {
    if (isCommandPaletteOpen || !linkModalOpen) return;

    if (key.name === "escape") {
      setLinkModalOpen(false);
      return;
    }

    if (aiConfigured && key.ctrl && (key.name === "f" || key.name === "F")) {
      key.preventDefault?.();
      await handleAutofill();
      return;
    }

    if (key.name === "tab" || key.name === "up" || key.name === "down") {
      setActiveField((prev) => (prev === "url" ? "title" : "url"));
      return;
    }

    if (key.name === "return") {
      if (activeField === "url") {
        if (aiConfigured && !titleVal.trim()) {
          void handleAutofill();
        }
        setActiveField("title");
      } else {
        await submit();
      }
    }
  });

  if (!linkModalOpen) return null;

  return (
    <box
      position="absolute"
      top={6}
      left="20%"
      width="60%"
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
      >
        <text fg={theme.accent.secondary}>{t(keys.MODAL_LINK_TITLE)}</text>
        <box flexDirection="row" gap={1}>
          {aiConfigured ? (
            isAutofilling ? (
              <text fg={theme.accent.purple}>
                {t(keys.MODAL_LINK_AUTOFILLING)}
              </text>
            ) : (
              <text fg={theme.accent.purple}>
                {t(keys.MODAL_LINK_AUTOFILL_BTN)}
              </text>
            )
          ) : null}
          <text fg={theme.text.dim}>{t(keys.MODAL_FOLDER_CANCEL_BADGE)}</text>
        </box>
      </box>

      <text fg={theme.text.muted} marginBottom={1}>
        {t(keys.MODAL_LINK_URL_LABEL)}
      </text>

      <box
        borderStyle="rounded"
        borderColor={
          activeField === "url" ? theme.accent.secondary : theme.border.subtle
        }
        paddingLeft={1}
        marginBottom={1}
        backgroundColor={theme.bg.input}
      >
        <input
          focused={activeField === "url"}
          value={urlVal}
          onChange={(val: string) => setUrlVal(val)}
          placeholder={t(keys.MODAL_LINK_URL_PLACEHOLDER)}
        />
      </box>

      <text fg={theme.text.muted} marginBottom={1}>
        {t(keys.MODAL_LINK_TITLE_LABEL)}
      </text>

      <box
        borderStyle="rounded"
        borderColor={
          activeField === "title" ? theme.accent.secondary : theme.border.subtle
        }
        paddingLeft={1}
        marginBottom={1}
        backgroundColor={theme.bg.input}
      >
        <input
          focused={activeField === "title"}
          value={titleVal}
          onChange={(val: string) => setTitleVal(val)}
          placeholder={t(keys.MODAL_LINK_TITLE_PLACEHOLDER)}
        />
      </box>

      <box flexDirection="row" justifyContent="flex-end" gap={2}>
        <text fg={theme.text.dim}>{t(keys.MODAL_LINK_HINT)}</text>
        <text fg={theme.border.success}>{t(keys.MODAL_LINK_SAVE_BTN)}</text>
      </box>
    </box>
  );
}
