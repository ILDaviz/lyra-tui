import React from "react";
import { LinkFilter } from "./types";
import { Theme } from "../../theme";
import { useTranslation } from "../../i18n";

interface LinkFilterTabsProps {
  filter: LinkFilter;
  manualCount: number;
  noteCount: number;
  myDayCount: number;
  totalCount: number;
  theme: Theme;
}

export function LinkFilterTabs({
  filter,
  manualCount,
  noteCount,
  myDayCount,
  totalCount,
  theme,
}: LinkFilterTabsProps): any {
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
          filter === "manual" ? theme.bg.buttonPrimary : theme.bg.selectedAlt
        }
      >
        <text fg={filter === "manual" ? theme.text.primary : theme.text.muted}>
          {`[1] ${t(keys.LINKS_FILTER_MANUAL)} (${manualCount})`}
        </text>
      </box>

      <box
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={
          filter === "notes" ? theme.bg.buttonSuccess : theme.bg.selectedAlt
        }
      >
        <text fg={filter === "notes" ? theme.text.primary : theme.text.muted}>
          {`[2] ${t(keys.LINKS_FILTER_NOTES)} (${noteCount})`}
        </text>
      </box>

      <box
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={
          filter === "myday" ? theme.accent.purple : theme.bg.selectedAlt
        }
      >
        <text fg={filter === "myday" ? theme.text.primary : theme.text.muted}>
          {`[3] ${t(keys.LINKS_FILTER_MYDAY)} (${myDayCount})`}
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
          {`[4] ${t(keys.LINKS_FILTER_ALL)} (${totalCount})`}
        </text>
      </box>
    </box>
  );
}
