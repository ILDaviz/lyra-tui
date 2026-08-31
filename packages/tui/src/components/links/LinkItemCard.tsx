import React, { memo } from "react";
import { LinkItem } from "@lyratui/core";
import { Theme } from "../../theme";
import { useTranslation } from "../../i18n";
import { MarqueeText } from "../MarqueeText";

interface LinkItemCardProps {
  link: LinkItem;
  isSelected: boolean;
  theme: Theme;
  termWidth: number;
}

function LinkItemCardImpl({
  link,
  isSelected,
  theme,
  termWidth,
}: LinkItemCardProps): any {
  const { t, keys } = useTranslation();

  const maxLineLen = Math.max(30, termWidth - 40);
  const rawTitle = link.title || link.url;

  let sourceLabel = `✎ ${t(keys.LINKS_SECTION_MANUAL)}`;
  let sourceColor = theme.accent.purple;

  if (!link.isManual) {
    if (link.folderName === "myday") {
      const rawFile = link.filename || "";
      const dateStr = rawFile.replace(/\.md$/, "");
      sourceLabel = `📅 ${t(keys.HEADER_BREADCRUMB_MYDAY)} · ${dateStr}`;
      sourceColor = theme.accent.green;
    } else {
      const rawNote = link.noteTitle || link.filename || "";
      const noteLabel =
        rawNote.length > 28 ? `${rawNote.slice(0, 27)}…` : rawNote;
      const folderLabel =
        link.folderName === "/"
          ? t(keys.HEADER_BREADCRUMB_ROOT)
          : link.folderName;
      sourceLabel = `📁 ${noteLabel} · ${folderLabel}`;
      sourceColor = theme.text.dim;
    }
  }

  return (
    <box
      key={link.id}
      id={`link-item-${link.id}`}
      flexDirection="column"
      width="100%"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={isSelected ? theme.bg.selected : undefined}
      marginBottom={1}
    >
      <box flexDirection="row" gap={1} alignItems="center" width="100%">
        <text fg={isSelected ? theme.accent.primary : theme.text.dim}>
          {isSelected ? "▸ " : "  "}
        </text>
        <MarqueeText
          text={rawTitle}
          maxLength={maxLineLen}
          isSelected={isSelected}
          isFocused={true}
          fg={isSelected ? theme.accent.primary : theme.text.secondary}
        />
      </box>

      <box flexDirection="row" gap={2} alignItems="center" paddingLeft={4}>
        <MarqueeText
          text={link.url}
          maxLength={Math.max(20, maxLineLen - 20)}
          isSelected={isSelected}
          isFocused={true}
          fg={isSelected ? theme.accent.cyan : theme.accent.secondary}
        />
        <text fg={sourceColor}>{sourceLabel}</text>
      </box>
    </box>
  );
}

export const LinkItemCard = memo(LinkItemCardImpl);
