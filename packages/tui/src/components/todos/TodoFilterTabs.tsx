import React from "react";
import { TodoFilter } from "./types";
import { Theme } from "../../theme";
import { useTranslation } from "../../i18n";

interface TodoFilterTabsProps {
  filter: TodoFilter;
  pendingCount: number;
  doneCount: number;
  totalCount: number;
  theme: Theme;
}

export function TodoFilterTabs({
  filter,
  pendingCount,
  doneCount,
  totalCount,
  theme,
}: TodoFilterTabsProps): any {
  const { t, keys } = useTranslation();

  return (
    <box
      flexDirection="row"
      gap={2}
      alignItems="center"
      flexShrink={0}
      marginBottom={1}
    >
      <box
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={
          filter === "pending" ? theme.bg.buttonPrimary : theme.bg.selectedAlt
        }
      >
        <text fg={filter === "pending" ? theme.text.primary : theme.text.muted}>
          {`[1] ${t(keys.TODOS_FILTER_PENDING)} (${pendingCount})`}
        </text>
      </box>

      <box
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={
          filter === "done" ? theme.bg.buttonSuccess : theme.bg.selectedAlt
        }
      >
        <text fg={filter === "done" ? theme.text.primary : theme.text.muted}>
          {`[2] ${t(keys.TODOS_FILTER_DONE)} (${doneCount})`}
        </text>
      </box>

      <box
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={
          filter === "all" ? theme.border.strong : theme.bg.selectedAlt
        }
      >
        <text fg={filter === "all" ? theme.text.primary : theme.text.muted}>
          {`[3] ${t(keys.TODOS_FILTER_ALL)} (${totalCount})`}
        </text>
      </box>
    </box>
  );
}
