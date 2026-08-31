import React, { useState, useEffect } from "react";
import type { Theme } from "../../theme";

export interface EditorRevisionsSkeletonProps {
  theme: Theme;
  count?: number;
}

export function EditorRevisionsSkeleton({
  theme,
  count = 4,
}: EditorRevisionsSkeletonProps): any {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPulse((p) => (p + 1) % 3);
    }, 260);
    return () => clearInterval(timer);
  }, []);

  const colorPrimary =
    pulse === 0
      ? theme.accent.secondary
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

  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <box flexDirection="column" width="100%" flexGrow={1}>
      {items.map((idx) => {
        const isFirst = idx === 0;
        return (
          <box
            key={idx}
            flexDirection="column"
            paddingLeft={1}
            paddingRight={1}
            paddingTop={0}
            paddingBottom={0}
            marginBottom={1}
            borderStyle="rounded"
            borderColor={isFirst ? colorPrimary : colorSubtle}
            backgroundColor={isFirst ? theme.bg.highlight : undefined}
          >
            <box
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <box flexDirection="row" gap={1}>
                <text fg={isFirst ? theme.accent.secondary : theme.text.dim}>
                  {isFirst ? "▸" : " "}
                </text>
                <text fg={isFirst ? colorPrimary : colorMuted}>███████</text>
              </box>
              <text fg={colorSubtle}>██████████</text>
            </box>

            <text fg={isFirst ? colorPrimary : colorMuted}>
              {idx % 2 === 0 ? "████████████████████████" : "████████████████"}
            </text>

            <text fg={colorSubtle}>
              {idx % 2 === 0 ? "by ████████" : "by ██████"}
            </text>
          </box>
        );
      })}
    </box>
  );
}
