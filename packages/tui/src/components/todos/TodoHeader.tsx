import React from "react";
import { Theme } from "../../theme";
import { useTranslation } from "../../i18n";

interface TodoHeaderProps {
  theme: Theme;
  doneCount: number;
  totalCount: number;
  percent: number;
}

export function TodoHeader({
  theme,
  doneCount,
  totalCount,
  percent,
}: TodoHeaderProps): any {
  const { t, keys } = useTranslation();

  const totalBars = 12;
  const filledBars = Math.round((percent / 100) * totalBars);
  const emptyBars = totalBars - filledBars;
  const progressBar = `[${"█".repeat(filledBars)}${"░".repeat(emptyBars)}] ${percent}%`;

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      flexShrink={0}
      paddingBottom={0.5}
      marginBottom={0.5}
    >
      <box flexDirection="row" gap={2} alignItems="center">
        <text fg={theme.text.highlight}>{t(keys.TODOS_TITLE)}</text>
        <text fg={theme.status.done}>{progressBar}</text>
        <text fg={theme.text.dim}>{`(${doneCount}/${totalCount})`}</text>
      </box>
    </box>
  );
}
