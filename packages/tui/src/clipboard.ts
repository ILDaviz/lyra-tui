import {
  createClipboard,
  createHostClipboard,
  createRendererClipboardAdapter,
} from "@opentui/core";
import type { CliRenderer, ClipboardService } from "@opentui/core";

let clipboard: ClipboardService | null = null;

export function initializeClipboard(renderer: CliRenderer) {
  const service = createClipboard({
    host: createHostClipboard(),
    terminal: createRendererClipboardAdapter(renderer),
  });
  clipboard = service;

  return async () => {
    if (clipboard === service) clipboard = null;
    await service.dispose();
  };
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text || !clipboard) return false;

  try {
    const result = await clipboard.writeText(text, {
      destination: "best-available",
    });
    return (
      result.host.status === "written" || result.terminal.status === "attempted"
    );
  } catch (err) {
    console.error("Failed to write clipboard text:", err);
    return false;
  }
}

export async function readTextFromClipboard(): Promise<string | null> {
  if (!clipboard) return null;

  try {
    const result = await clipboard.read({ preferredTypes: ["text/plain"] });
    if (result.status !== "read") return null;
    return new TextDecoder().decode(result.representation.bytes);
  } catch (err) {
    console.error("Failed to read clipboard text:", err);
    return null;
  }
}
