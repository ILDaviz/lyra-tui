import React from "react";
import { useTranslation } from "../../i18n";
import { useTheme } from "../../theme";

interface EditorHeaderProps {
  title: string;
  folder: string;
  linesCount: number;
  wordsCount: number;
  isEditing: boolean;
}

export function EditorHeader({
  title,
  folder,
  linesCount,
  wordsCount,
  isEditing,
}: EditorHeaderProps): any {
  const theme = useTheme();
  const { t, keys } = useTranslation();

  const rawFolderName =
    folder === "/" ? t(keys.HEADER_BREADCRUMB_ROOT) : folder;
  const folderLabel =
    rawFolderName.length > 15
      ? `${rawFolderName.slice(0, 14)}…`
      : rawFolderName;
  const rawTitle = title;
  const titleLabel =
    rawTitle.length > 28 ? `${rawTitle.slice(0, 27)}…` : rawTitle;

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      marginBottom={1}
      paddingBottom={1}
    >
      <box flexDirection="row" gap={1} alignItems="center">
        <text
          fg={isEditing ? theme.accent.primary : theme.text.primary}
        >{`📝 ${titleLabel}`}</text>
        <text fg={theme.text.dim}>{`📁 ${folderLabel}`}</text>
      </box>

      <box flexDirection="row" gap={2} alignItems="center">
        <text fg={theme.text.dim}>
          {t(keys.EDITOR_HEADER_STATS, {
            lines: linesCount,
            words: wordsCount,
          })}
        </text>
        <text fg={isEditing ? theme.accent.primary : theme.accent.secondary}>
          {isEditing
            ? `● ${t(keys.EDITOR_BADGE_EDITING)}`
            : `○ ${t(keys.EDITOR_BADGE_VIEWING)}`}
        </text>
      </box>
    </box>
  );
}
