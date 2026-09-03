import React, { useState, useMemo, useEffect } from "react";
import { useAppStore } from "../../store";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { TodoItem, TodoStatus } from "@lyratui/core";
import { useTranslation } from "../../i18n";
import { useTheme } from "../../theme";
import { VirtualList } from "../common/VirtualList";
import { ListFilterBar } from "../common/ListFilterBar";
import { useFuseFilter } from "../../utils/fuzzy";
import { TodoFilter } from "./types";
import { TodoHeader } from "./TodoHeader";
import { TodoFilterTabs } from "./TodoFilterTabs";
import { TodoItemCard } from "./TodoItemCard";

const TODO_FUSE_KEYS = [
  "text",
  "rawText",
  "noteTitle",
  "filename",
  "tags",
  "dueDate",
];

export type TodoSortMode = "default" | "due" | "priority" | "text";

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

function sortTodos(items: TodoItem[], mode: TodoSortMode): TodoItem[] {
  if (mode === "default") return items;
  const sorted = [...items];
  if (mode === "due") {
    sorted.sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });
  } else if (mode === "priority") {
    sorted.sort(
      (a, b) =>
        (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1),
    );
  } else if (mode === "text") {
    sorted.sort((a, b) => a.text.localeCompare(b.text));
  }
  return sorted;
}

export function TodosView(): any {
  const theme = useTheme();
  const todos = useAppStore((s) => s.todos);
  const toggleTodoItem = useAppStore((s) => s.toggleTodoItem);
  const setTodoItemStatus = useAppStore((s) => s.setTodoItemStatus);
  const setTodoItemPriority = useAppStore((s) => s.setTodoItemPriority);
  const openTodoSource = useAppStore((s) => s.openTodoSource);
  const activePane = useAppStore((s) => s.activePane);
  const refreshTodos = useAppStore((s) => s.refreshTodos);
  const isCommandPaletteOpen = useAppStore((s) => s.isCommandPaletteOpen);
  const isHelpOpen = useAppStore((s) => s.isHelpOpen);
  const { t, keys } = useTranslation();
  const isFocused = activePane === "list";
  const { width: termWidth } = useTerminalDimensions();

  const [filter, setFilter] = useState<TodoFilter>("pending");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [filterQuery, setFilterQuery] = useState<string>("");
  const [isFilterEditing, setIsFilterEditing] = useState<boolean>(false);
  const [sortMode, setSortMode] = useState<TodoSortMode>("default");

  const fuseTodos = useFuseFilter(todos, TODO_FUSE_KEYS, filterQuery);

  const pendingCount = useMemo(
    () => fuseTodos.filter((t) => !t.done).length,
    [fuseTodos],
  );
  const doneCount = useMemo(
    () => fuseTodos.filter((t) => t.done).length,
    [fuseTodos],
  );
  const percent =
    fuseTodos.length > 0 ? Math.round((doneCount / fuseTodos.length) * 100) : 0;

  const statusFilteredTodos = useMemo(() => {
    if (filter === "pending") {
      return fuseTodos.filter((t) => !t.done);
    }
    if (filter === "done") {
      return fuseTodos.filter((t) => t.done);
    }
    return fuseTodos;
  }, [fuseTodos, filter]);

  const filteredTodos = useMemo(
    () => sortTodos(statusFilteredTodos, sortMode),
    [statusFilteredTodos, sortMode],
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [filterQuery, sortMode]);

  useEffect(() => {
    if (!isFocused) return;
    if (filteredTodos.length === 0) {
      setSelectedIndex(0);
      return;
    }
    const safeIndex = Math.max(
      0,
      Math.min(selectedIndex, filteredTodos.length - 1),
    );
    if (safeIndex !== selectedIndex) {
      setSelectedIndex(safeIndex);
    }
  }, [selectedIndex, filteredTodos.length, filter, isFocused]);

  const applyToSelected = (action: (origIdx: number) => void) => {
    const item = filteredTodos[selectedIndex];
    if (!item) return;
    const origIdx = todos.findIndex(
      (t) =>
        t.folderName === item.folderName &&
        t.filename === item.filename &&
        t.index === item.index,
    );
    if (origIdx !== -1) action(origIdx);
  };

  useKeyboard((key) => {
    if (isCommandPaletteOpen || isHelpOpen || !isFocused) return;

    if (isFilterEditing) {
      if (key.name === "escape") {
        setFilterQuery("");
        setIsFilterEditing(false);
        setSelectedIndex(0);
      } else if (key.name === "return") {
        setIsFilterEditing(false);
      }
      return;
    }

    if (key.name === "/") {
      setIsFilterEditing(true);
      return;
    }

    if (key.name === "o") {
      setSortMode((prev) =>
        prev === "default"
          ? "due"
          : prev === "due"
            ? "priority"
            : prev === "priority"
              ? "text"
              : "default",
      );
      return;
    }

    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : Math.max(0, filteredTodos.length - 1),
      );
    } else if (key.name === "down" || key.name === "j") {
      setSelectedIndex((prev) =>
        prev < filteredTodos.length - 1 ? prev + 1 : 0,
      );
    } else if (key.name === "t" || key.name === "f") {
      setFilter((prev) =>
        prev === "pending" ? "done" : prev === "done" ? "all" : "pending",
      );
      setSelectedIndex(0);
    } else if (key.name === "1" || key.name === "p") {
      setFilter("pending");
      setSelectedIndex(0);
    } else if (key.name === "2" || key.name === "d") {
      setFilter("done");
      setSelectedIndex(0);
    } else if (key.name === "3" || key.name === "a") {
      setFilter("all");
      setSelectedIndex(0);
    } else if (key.name === "space" || key.name === "return") {
      applyToSelected(toggleTodoItem);
    } else if (key.name === "r" && key.ctrl) {
      refreshTodos();
    } else if (key.name === "g") {
      const item = filteredTodos[selectedIndex];
      if (item) {
        openTodoSource(item);
      }
    } else if (key.name === "m") {
      applyToSelected((idx) => {
        const order = ["Low", "Medium", "High"];
        const current = todos[idx]?.priority || "Medium";
        const next =
          order[(order.indexOf(current) + 1) % order.length] || "Medium";
        setTodoItemPriority(idx, next);
      });
    } else if (key.name === "s") {
      applyToSelected((idx) => {
        const order: TodoStatus[] = [
          "todo",
          "in_progress",
          "urgent",
          "question",
          "paused",
        ];
        const current =
          todos[idx]?.status || (todos[idx]?.done ? "done" : "todo");
        const currentIndex = order.indexOf(current as TodoStatus);
        const next =
          currentIndex !== -1
            ? order[(currentIndex + 1) % order.length]
            : "in_progress";
        setTodoItemStatus(idx, next);
      });
    }
  });

  return (
    <box
      borderStyle="rounded"
      borderColor={isFocused ? theme.border.focus : theme.border.subtle}
      flexGrow={1}
      flexShrink={1}
      height="100%"
      flexDirection="column"
      padding={1}
      backgroundColor={theme.bg.panel}
    >
      <TodoHeader
        theme={theme}
        doneCount={doneCount}
        totalCount={todos.length}
        percent={percent}
      />

      <TodoFilterTabs
        filter={filter}
        pendingCount={pendingCount}
        doneCount={doneCount}
        totalCount={fuseTodos.length}
        theme={theme}
      />

      <ListFilterBar
        query={filterQuery}
        onQueryChange={setFilterQuery}
        isActive={isFilterEditing}
        totalCount={todos.length}
        filteredCount={filteredTodos.length}
        theme={theme}
      />

      {sortMode !== "default" ? (
        <box flexDirection="row" marginBottom={1} flexShrink={0}>
          <text fg={theme.text.dim}>
            {`↕ ${t(keys.TODOS_SORT_LABEL)}: ${
              sortMode === "due"
                ? t(keys.TODOS_SORT_DUE)
                : sortMode === "priority"
                  ? t(keys.TODOS_SORT_PRIORITY)
                  : t(keys.TODOS_SORT_TEXT)
            }`}
          </text>
        </box>
      ) : null}

      {filteredTodos.length === 0 ? (
        <box
          justifyContent="center"
          alignItems="center"
          flexGrow={1}
          flexDirection="column"
          gap={1}
        >
          <text fg={theme.text.muted}>{t(keys.TODOS_EMPTY)}</text>
          <text fg={theme.text.faint}>{t(keys.TODOS_EMPTY_HINT)}</text>
        </box>
      ) : (
        <VirtualList
          items={filteredTodos}
          itemHeight={3}
          selectedIndex={selectedIndex}
          theme={theme}
          isFocused={isFocused}
          getKey={(todo, idx) =>
            `${todo.folderName}-${todo.filename}-${todo.index}-${idx}`
          }
          renderItem={(todo, idx, isSelected) => (
            <TodoItemCard
              todo={todo}
              isSelected={isSelected}
              theme={theme}
              termWidth={termWidth}
            />
          )}
        />
      )}
    </box>
  );
}
