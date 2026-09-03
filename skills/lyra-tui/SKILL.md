---
name: lyra-tui
description: "Use when teaching a human user or an AI agent how to operate the Lyra TUI (terminal UI): launching the app, panes and focus, every keyboard shortcut (sidebar, notes, editor, todos, links, My Day), the command palette, help modal, themes, and languages. Triggers on: 'Lyra TUI', 'the TUI', 'keybindings', 'shortcuts', 'editor keys', 'command palette', 'how do I use the terminal UI'."
---

# Lyra TUI — Interactive Terminal Workspace

This skill documents how to **use the Lyra interactive TUI**. For scripted or
automated vault access, prefer the [`lyra-cli`](../lyra-cli/SKILL.md) skill;
for vault settings (AI providers, themes, sync, paths) see
[`lyra-config`](../lyra-config/SKILL.md).

## Launching

```bash
lyra                                   # installed binary
bun run packages/tui/bin/lyra-tui.ts   # from this repository
```

The vault is a plain folder of Markdown files:

- Production default: `~/.lyra`
- Development: `~/.lyra_dev`, tests: `~/.lyra_test`
- Override with the `LYRA_REPO_PATH` environment variable, e.g.
  `LYRA_REPO_PATH="$PWD/lyra_dev" bun run packages/tui/bin/lyra-tui.ts`
- Note attachments are copied into `<vault>/attachments/` and referenced with
  vault-relative Markdown links (`attachments/file.pdf`), compatible with
  Obsidian's default attachment folder setting

AI-assisted features appear only when a provider is configured (see
[`lyra-config`](../lyra-config/SKILL.md)); all other functionality works
without AI.

## Layout And Focus

```
┌──────────────────────────────────────────────────────────┐
│ Header (view + breadcrumb)                               │
├────────────┬──────────────────┬──────────────────────────┤
│ Sidebar    │ Notes list       │ Editor (view / edit)     │
│ (views +   │ (or My Day /     │                          │
│  folders)  │  Todos / Links)  │                          │
├────────────┴──────────────────┴──────────────────────────┤
│ Footer (context hints)                                   │
└──────────────────────────────────────────────────────────┘
```

- `Tab` cycles focus: **Navigator ➔ Notes list ➔ Editor** (in Todos and Links
  views focus alternates between Navigator and list only).
- The terminal window title always reflects the current view, note, folder, or
  date.

## Global Shortcuts

| Key             | Action                                                     |
| --------------- | ---------------------------------------------------------- |
| `Tab`           | Move focus (Navigator ➔ Notes ➔ Editor)                    |
| `Ctrl+H` / `F1` | Open / close the contextual quick-help panel               |
| `Ctrl+P`        | Command Palette and global search (includes Git Pull/Push) |
| `Ctrl+Q`        | Quit Lyra                                                  |
| Selection       | Selected text is copied to the clipboard automatically     |

Inside the help panel: `Tab`/arrows switch tabs (`[1]` Contextual, `[2]`
General, `[3]` Todos Guide, `[4]` About & Repo), `/` searches shortcuts, `Esc`
closes.

## Views

Four special sidebar entries switch the main area:

- **Notes** — folder contents and the Markdown editor.
- **My Day** — daily logs (`myday/YYYY-MM-DD.md`).
- **Todos** — vault-wide task aggregation across notes and daily logs.
- **Links** — bookmark catalog (manual + extracted from Markdown).

Switch views by selecting them in the sidebar (`Enter`/`Space`) or from the
command palette ("View Notes / My Day / Todos / Links").

## Navigator (Sidebar: Folders & Views)

| Key                          | Action                                |
| ---------------------------- | ------------------------------------- |
| `Up`/`Down` or `j`/`k`       | Navigate folders and views            |
| `Enter` / `Space`            | Select folder or open special view    |
| `n` / `Ctrl+F`               | Create new folder (modal)             |
| `r` / `F2`                   | Rename selected folder (modal)        |
| `d` / `Delete` / `Backspace` | Delete selected folder (confirmation) |

## Notes List

| Key                     | Action                                        |
| ----------------------- | --------------------------------------------- |
| `Up`/`Down` or `j`/`k`  | Navigate notes                                |
| `Enter` / `Space`       | Open note in Editor (viewing mode)            |
| `Ctrl+N`                | Create new note in current folder             |
| `v` / `Ctrl+E`          | Open in external editor (`$VISUAL`/`$EDITOR`) |
| `m`                     | Move note to another folder (modal)           |
| `d` / `Delete`          | Delete note (confirmation modal)              |
| `PgUp` / `PgDn`         | Page through notes                            |
| `Home`/`End` or `g`/`G` | Jump to first / last note                     |

## Editor — Viewing Mode

| Key                                     | Action                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `e` / `i` / `Enter`                     | Enter text **editing** mode                                                                    |
| `v` / `Ctrl+E`                          | Open in external editor (`$VISUAL`/`$EDITOR`)                                                  |
| `Ctrl+C`/`Cmd+C` or `y`                 | Copy note / selection                                                                          |
| `Ctrl+Shift+A` / `Cmd+Shift+A`          | Open the AI assistant (if configured)                                                          |
| `b` / `Ctrl+G` / `Cmd+G`                | Local knowledge graph of this note                                                             |
| `h`                                     | Revision history (preview / restore)                                                           |
| `a`                                     | Attachments of this note (`Enter` opens with the default system app, `f` opens `attachments/`) |
| `m`                                     | Move note to another folder                                                                    |
| `d` / `Delete` / `Backspace` / `Ctrl+D` | Delete note (confirmation)                                                                     |
| `Up`/`Down` or `j`/`k`                  | Scroll                                                                                         |
| `PgUp` / `PgDn` / `Space`               | Rapid page scroll                                                                              |
| `Home`/`End`/`Shift+G`                  | Jump to top / bottom                                                                           |

## Editor — Editing Mode

| Key                            | Action                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `Ctrl+S` / `Cmd+S`             | Save changes                                                                                                                     |
| `Esc`                          | Save and exit edit mode                                                                                                          |
| `Ctrl+E` / `Cmd+E`             | Open in external editor                                                                                                          |
| `Ctrl+B` / `Cmd+B`             | Bold                                                                                                                             |
| `Ctrl+I` / `Cmd+I`             | Link (`[[...]]`)                                                                                                                 |
| `Ctrl+L` / `Cmd+L`             | Insert todo checkbox `[ ]`                                                                                                       |
| `Ctrl+T` / `Cmd+T`             | Insert code block                                                                                                                |
| `Ctrl+Alt+K`                   | Insert a code block                                                                                                              |
| `Ctrl+W` / `Cmd+W`             | Insert wikilink (opens the picker)                                                                                               |
| `Ctrl+O` / `Cmd+O`             | Attach a file: type, paste, or drag the file onto the terminal; it is copied into `attachments/` and a Markdown link is inserted |
| `Ctrl+Shift+A` / `Cmd+Shift+A` | AI assistant (rewrite / memo, if configured)                                                                                     |
| `Ctrl+C` / `X` / `V`           | Copy / cut / paste selection                                                                                                     |
| `Tab`                          | Indent current line                                                                                                              |

## My Day (Daily Log)

| Key                    | Action                  |
| ---------------------- | ----------------------- |
| `Up`/`Down` or `j`/`k` | Navigate dates          |
| `Enter` / `Space`      | Open selected daily log |
| `v` / `Ctrl+E`         | Open in external editor |

Daily logs live in `myday/YYYY-MM-DD.md` and can contain normal Markdown,
todos, and links.

## Todos View

| Key               | Action                                                                                |
| ----------------- | ------------------------------------------------------------------------------------- |
| `Space` / `Enter` | Complete / reopen task (the only way to complete)                                     |
| `s`               | Cycle status: `[ ]` ➔ `[>]` in progress ➔ `[!]` urgent ➔ `[?]` waiting ➔ `[-]` paused |
| `m`               | Cycle priority: Medium ➔ High ➔ Low                                                   |
| `g`               | Go to the note / daily log containing the task                                        |
| `1` or `p`        | Filter: pending tasks                                                                 |
| `2` or `d`        | Filter: completed tasks                                                               |
| `3` or `a`        | Filter: all tasks                                                                     |
| `t` / `f`         | Cycle filters                                                                         |
| `Ctrl+R`          | Reload and resync tasks from all notes                                                |

### Todo Markdown Syntax

Written inside any note or daily log; statuses are checkbox markers:

```markdown
- [ ] Pending task (default)
- [>] Task in progress (- [/] is equivalent)
- [!] Urgent task (auto High priority)
- [?] Question / waiting on someone
- [-] Paused task
- [x] Completed task (- [X] also works)
```

Metadata appended to the line:

```markdown
- [ ] Ship the release @priority(high) @due(2026-09-01) #work #v2
```

- Priority: `@priority(high)` / `[High]` / `!high`; medium: `@priority(medium)` / `[Medium]`; low: `@priority(low)` / `[Low]` / `!low`
- Due date: `@due(YYYY-MM-DD)` or `due:YYYY-MM-DD`
- Tags: `#tag` (custom, multiple allowed)

## Links View

| Key                                | Action                                  |
| ---------------------------------- | --------------------------------------- |
| `Up`/`Down` or `j`/`k`             | Navigate links                          |
| `Enter`                            | Open link in default web browser        |
| `a`                                | Add a manual link (modal)               |
| `d` / `Delete` / `Backspace` / `x` | Delete selected **manual** link         |
| `g`                                | Go to the note containing the link      |
| `1` or `m`                         | Filter: manual bookmarks                |
| `2` or `n`                         | Filter: links extracted from notes      |
| `3` or `y`                         | Filter: links extracted from daily logs |
| `4`                                | Filter: all links                       |
| `t` / `f`                          | Cycle filters                           |
| `Ctrl+R`                           | Reload catalog from notes               |

## Command Palette (`Ctrl+P`)

Two tabs: **Commands** and **Notes search** (fuzzy search across all note
titles, filenames, and content snippets).

Available commands:

- Create new note / create new folder
- View Notes / My Day / Todos / Links
- Git Pull / Git Push (commits and syncs the vault)
- Refresh all data
- Open note history (when a note is active)
- Open in external editor
- Switch language: English / Italiano
- Switch theme: Dark, Light, Dracula, Nord, Catppuccin, Tokyo Night, Monokai,
  Omarchy System (on supported environments) — theme ids and persistence are
  documented in [`lyra-config`](../lyra-config/SKILL.md)
- Go to folder: `<folder name>` (one entry per vault folder)

## Git From The TUI

- Pull / push from the command palette (`Ctrl+P`).
- Note, folder, task, and bookmark changes can be committed with meaningful
  messages when the vault is a Git repository.
- For scheduled synchronization use the CLI daemon (see
  [`lyra-cli`](../lyra-cli/SKILL.md)).

## Notes For AI Agents

- The TUI is **interactive**: you cannot press keys for the user. Guide the
  human by naming the exact keys, or perform the same action yourself via the
  CLI (`lyra note ...`, `lyra todo ...`, ...) when possible.
- Every mutation available in the TUI (new note, folder, move, delete, toggle)
  has a CLI equivalent for automation — except status cycling beyond
  done/undone, which is TUI-only (`s` key).
- If the user reports an unknown key, tell them to press `Ctrl+H` (help) or
  `Ctrl+P` (palette) — the palette fuzzy-searches everything.
