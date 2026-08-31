import { describe, expect, it } from "vitest";
import { createTestKeymap } from "@opentui/keymap/testing";
import { registerCommaBindings } from "@opentui/keymap/addons";

describe("keyboard command layers", () => {
  it("dispatches native copy, cut, and paste chords", () => {
    const harness = createTestKeymap({ defaultKeys: true });
    const handled: string[] = [];

    try {
      registerCommaBindings(harness.keymap);
      harness.keymap.registerLayer({
        commands: [
          {
            name: "editor.copy",
            run: () => {
              handled.push("copy");
            },
          },
          {
            name: "editor.cut",
            run: () => {
              handled.push("cut");
            },
          },
          {
            name: "editor.paste",
            run: () => {
              handled.push("paste");
            },
          },
        ],
        bindings: [
          { key: "ctrl+c, super+c", cmd: "editor.copy" },
          { key: "ctrl+x, super+x", cmd: "editor.cut" },
          { key: "ctrl+v, super+v", cmd: "editor.paste" },
        ],
      });

      harness.host.press("c", { ctrl: true });
      harness.host.press("x", { ctrl: true });
      harness.host.press("v", { ctrl: true });
      harness.host.press("c", { super: true });
      harness.host.press("x", { super: true });
      harness.host.press("v", { super: true });

      expect(handled).toEqual(["copy", "cut", "paste", "copy", "cut", "paste"]);
    } finally {
      harness.cleanup();
    }
  });

  it("gives editor formatting bindings precedence over textarea bindings", () => {
    const harness = createTestKeymap({ defaultKeys: true });
    const handled: string[] = [];

    try {
      harness.keymap.registerLayer({
        priority: 0,
        commands: [
          {
            name: "input.move.left",
            run: () => {
              handled.push("move-left");
            },
          },
        ],
        bindings: [{ key: "ctrl+b", cmd: "input.move.left" }],
      });
      harness.keymap.registerLayer({
        priority: 100,
        commands: [
          {
            name: "editor.bold",
            run: () => {
              handled.push("bold");
            },
          },
        ],
        bindings: [{ key: "ctrl+b", cmd: "editor.bold" }],
      });

      harness.host.press("b", { ctrl: true });

      expect(handled).toEqual(["bold"]);
    } finally {
      harness.cleanup();
    }
  });

  it("gives palette navigation bindings precedence over input bindings", () => {
    const harness = createTestKeymap({ defaultKeys: true });
    const handled: string[] = [];

    try {
      harness.keymap.registerLayer({
        priority: 0,
        commands: [
          {
            name: "input.move.down",
            run: () => {
              handled.push("input-down");
            },
          },
        ],
        bindings: [{ key: "down", cmd: "input.move.down" }],
      });
      harness.keymap.registerLayer({
        priority: 100,
        commands: [
          {
            name: "palette.result.next",
            run: () => {
              handled.push("palette-down");
            },
          },
        ],
        bindings: [{ key: "down", cmd: "palette.result.next" }],
      });

      harness.host.press("down");

      expect(handled).toEqual(["palette-down"]);
    } finally {
      harness.cleanup();
    }
  });

  it("gives AI modal menu navigation bindings precedence over input bindings", () => {
    const harness = createTestKeymap({ defaultKeys: true });
    const handled: string[] = [];

    try {
      registerCommaBindings(harness.keymap);
      harness.keymap.registerLayer({
        priority: 0,
        commands: [
          {
            name: "input.move.down",
            run: () => {
              handled.push("input-down");
            },
          },
        ],
        bindings: [{ key: "down", cmd: "input.move.down" }],
      });
      harness.keymap.registerLayer({
        priority: 100,
        commands: [
          {
            name: "ai.menu.next",
            run: () => {
              handled.push("ai-down");
            },
          },
        ],
        bindings: [{ key: "down, ctrl+j, ctrl+n, tab", cmd: "ai.menu.next" }],
      });

      harness.host.press("down");
      harness.host.press("tab");
      harness.host.press("j", { ctrl: true });

      expect(handled).toEqual(["ai-down", "ai-down", "ai-down"]);
    } finally {
      harness.cleanup();
    }
  });
});
