import React from "react";
import { TodoItem } from "@lyratui/core";
import { Theme } from "../../theme";

interface TodoStatusBadgeProps {
  todo: TodoItem;
  theme: Theme;
}

export function TodoStatusBadge({ todo, theme }: TodoStatusBadgeProps): any {
  const status = todo.status || (todo.done ? "done" : "todo");
  switch (status) {
    case "in_progress":
      return <text fg={theme.status.inProgress}>[&gt;]</text>;
    case "urgent":
      return <text fg={theme.status.urgent}>[!]</text>;
    case "question":
      return <text fg={theme.status.question}>[?]</text>;
    case "paused":
    case "cancelled" as any:
      return (
        <text fg={theme.status.paused || theme.status.cancelled}>[-]</text>
      );
    case "done":
      return <text fg={theme.status.done}>[✓]</text>;
    case "todo":
    default:
      return <text fg={theme.status.todo}>[ ]</text>;
  }
}
