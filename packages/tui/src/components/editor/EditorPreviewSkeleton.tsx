import React, { useState, useEffect } from "react";
import type { Theme } from "../../theme";

export interface EditorPreviewSkeletonProps {
  theme: Theme;
}

export function EditorPreviewSkeleton({
  theme,
}: EditorPreviewSkeletonProps): any {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPulse((p) => (p + 1) % 3);
    }, 260);
    return () => clearInterval(timer);
  }, []);

  const colorPrimary =
    pulse === 0
      ? theme.border.focus
      : pulse === 1
        ? theme.text.dim
        : theme.text.faint;

  const colorMuted =
    pulse === 0
      ? theme.text.dim
      : pulse === 1
        ? theme.text.faint
        : theme.border.subtle;

  const colorSubtle =
    pulse === 0
      ? theme.text.faint
      : pulse === 1
        ? theme.border.subtle
        : theme.bg.highlight;

  return (
    <box flexDirection="column" gap={1} padding={1} width="100%" flexGrow={1}>
      <box flexDirection="row" gap={1} alignItems="center">
        <text fg={theme.accent.primary}>#</text>
        <text fg={colorPrimary}>████████████████████████</text>
      </box>

      <box flexDirection="row" gap={1} alignItems="center">
        <text fg={colorSubtle}>██████████████</text>
      </box>

      <box height={1} />

      <box flexDirection="column" gap={0}>
        <text fg={colorMuted}>
          ████████████████████████████████████████████████████
        </text>
        <text fg={colorMuted}>
          ████████████████████████████████████████████
        </text>
        <text fg={colorSubtle}>████████████████████████</text>
      </box>

      <box height={1} />

      <box flexDirection="column" gap={0}>
        <box flexDirection="row" gap={1}>
          <text fg={theme.accent.secondary}>●</text>
          <text fg={colorMuted}>██████████████████████████████</text>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={theme.accent.secondary}>●</text>
          <text fg={colorMuted}>████████████████████</text>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={theme.accent.secondary}>●</text>
          <text fg={colorMuted}>████████████████████████████████████</text>
        </box>
      </box>

      <box height={1} />

      <box
        flexDirection="column"
        borderStyle="rounded"
        borderColor={colorSubtle}
        backgroundColor={theme.bg.panel}
        padding={1}
        gap={0}
      >
        <text fg={colorMuted}>████████████████████████████</text>
        <text fg={colorSubtle}>████████████████████</text>
        <text fg={colorSubtle}>████████████████████████████████</text>
      </box>
    </box>
  );
}
