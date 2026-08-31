import React, { useEffect, useState } from "react";
import { useAppStore } from "../store";
import type { BootStepId } from "../store/types";
import { useTranslation } from "../i18n";
import { useTheme } from "../theme";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function BootScreen(): any {
  const theme = useTheme();
  const { t, keys } = useTranslation();
  const repoPath = useAppStore((s) => s.repoPath);
  const bootSteps = useAppStore((s) => s.bootSteps);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setFrame((f) => (f + 1) % SPINNER_FRAMES.length),
      80,
    );
    return () => clearInterval(timer);
  }, []);

  const steps: Array<{ id: BootStepId; label: string }> = [
    { id: "folders", label: t(keys.BOOT_STEP_FOLDERS) },
    { id: "notes", label: t(keys.BOOT_STEP_NOTES) },
    { id: "myday", label: t(keys.BOOT_STEP_MYDAY) },
    { id: "todos", label: t(keys.BOOT_STEP_TODOS) },
    { id: "links", label: t(keys.BOOT_STEP_LINKS) },
    { id: "graph", label: t(keys.BOOT_STEP_GRAPH) },
  ];

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      backgroundColor={theme.bg.app}
    >
      <box
        width={64}
        flexDirection="column"
        gap={1}
        borderStyle="rounded"
        borderColor={theme.border.subtle}
        backgroundColor={theme.bg.panel}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        <box flexDirection="row" gap={1} alignItems="center">
          <text fg={theme.accent.primary}>◆</text>
          <text fg={theme.text.primary}>{t(keys.BOOT_TITLE)}</text>
          <text fg={theme.text.muted}>— {t(keys.BOOT_SUBTITLE)}</text>
        </box>

        {repoPath ? (
          <box flexDirection="row" gap={1}>
            <text fg={theme.text.dim}>{t(keys.BOOT_VAULT_LABEL)}</text>
            <text fg={theme.text.muted}>{repoPath}</text>
          </box>
        ) : null}

        <box flexDirection="column" gap={0} paddingLeft={1}>
          {steps.map(({ id, label }) => {
            const status = bootSteps[id];
            const icon =
              status === "done"
                ? "●"
                : status === "running"
                  ? SPINNER_FRAMES[frame]
                  : "○";
            const statusColor =
              status === "done"
                ? theme.text.success
                : status === "running"
                  ? theme.accent.primary
                  : theme.text.faint;
            const labelColor =
              status === "pending" ? theme.text.faint : theme.text.secondary;
            const statusLabel =
              status === "done"
                ? t(keys.BOOT_STEP_DONE)
                : status === "running"
                  ? t(keys.BOOT_STEP_RUNNING)
                  : t(keys.BOOT_STEP_WAITING);

            return (
              <box
                key={id}
                flexDirection="row"
                justifyContent="space-between"
                width="100%"
              >
                <box flexDirection="row" gap={1}>
                  <text fg={statusColor}>{icon}</text>
                  <text fg={labelColor}>{label}</text>
                </box>
                <text fg={statusColor}>{statusLabel}</text>
              </box>
            );
          })}
        </box>

        <text fg={theme.text.faint}>{t(keys.BOOT_HINT)}</text>
      </box>
    </box>
  );
}
