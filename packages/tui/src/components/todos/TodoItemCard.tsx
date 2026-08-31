import React, { memo } from "react";
import { TodoItem } from "@lyratui/core";
import { Theme } from "../../theme";
import { useTranslation } from "../../i18n";
import { cleanTodoText } from "./utils";
import { TodoStatusBadge } from "./TodoStatusBadge";
import { MarqueeText } from "../MarqueeText";

interface TodoItemCardProps {
  todo: TodoItem;
  isSelected: boolean;
  theme: Theme;
  termWidth: number;
}

function TodoItemCardImpl({
  todo,
  isSelected,
  theme,
  termWidth,
}: TodoItemCardProps): any {
  const { t, keys } = useTranslation();

  const priorityColor =
    todo.priority === "High"
      ? theme.status.priorityHigh
      : todo.priority === "Medium"
        ? theme.status.priorityMedium
        : theme.status.priorityLow;

  const rawTitle = todo.noteTitle || todo.filename;
  const noteLabel =
    rawTitle.length > 28 ? `${rawTitle.slice(0, 27)}…` : rawTitle;
  const todoText = cleanTodoText(todo.text);
  const maxTextLen = Math.max(30, termWidth - 40);
  const sourceLabel =
    todo.folderName === "/" ? t(keys.HEADER_BREADCRUMB_ROOT) : todo.folderName;
  const dateLabel = todo.dueDate
    ? t(keys.TODO_DUE_PREFIX, { date: todo.dueDate })
    : "";

  return (
    <box
      key={`${todo.folderName}-${todo.filename}-${todo.index}`}
      id={`todo-item-${todo.folderName}-${todo.filename}-${todo.index}`}
      flexDirection="column"
      width="100%"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={isSelected ? theme.bg.highlight : undefined}
      marginBottom={1}
    >
      <box flexDirection="row" gap={1} alignItems="flex-start" width="100%">
        <text fg={isSelected ? theme.accent.primary : theme.border.default}>
          {isSelected ? "▎" : " "}
        </text>
        <TodoStatusBadge todo={todo} theme={theme} />
        <MarqueeText
          text={todoText}
          maxLength={maxTextLen}
          isSelected={isSelected}
          isFocused={true}
          fg={
            todo.done
              ? theme.text.dim
              : isSelected
                ? theme.text.primary
                : theme.text.secondary
          }
        />
      </box>

      <box flexDirection="row" gap={2} alignItems="center" paddingLeft={4}>
        <text fg={priorityColor}>{`● ${todo.priority}`}</text>
        <text fg={theme.text.dim}>{`📁 ${noteLabel}`}</text>
        <text fg={theme.text.dim}>{sourceLabel}</text>
        {dateLabel ? (
          <text fg={theme.accent.secondary}>{dateLabel}</text>
        ) : null}
        {todo.tags && todo.tags.length > 0 ? (
          <text fg={theme.accent.purple}>
            {todo.tags.map((tg) => `#${tg}`).join(" ")}
          </text>
        ) : null}
      </box>
    </box>
  );
}

export const TodoItemCard = memo(TodoItemCardImpl);
