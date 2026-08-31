---
name: lyra-cli
description: "Use when running, scripting, or automating Lyra from the command line: the full `lyra` command reference (status, note, today, todo, links, graph, sync, daemon), every option and flag, JSON output for machines, --dry-run safety, and guidance for AI agents driving the vault. Triggers on: 'lyra command', 'lyra CLI', 'script Lyra', 'lyra --json', 'automate the vault', 'lyra sync', 'command reference'."
---

# Lyra CLI — Command Reference

The `lyra` binary drives the same vault as the TUI without opening it. Every
command prints human-readable text by default and structured JSON with
`--json`. For the interactive interface see [`lyra-tui`](../lyra-tui/SKILL.md);
for vault settings (AI providers, themes, sync, paths) see
[`lyra-config`](../lyra-config/SKILL.md).

## Invocation

```bash
lyra <command> [subcommand] [options]          # installed binary
bun run packages/tui/bin/lyra-tui.ts <command> # from this repository
```

- Vault: `~/.lyra` by default (`~/.lyra_dev` in development). Override with
  `LYRA_REPO_PATH=/path/to/vault`.
- Global flags: `-h, --help`, `-v, --version`, `--no-color` (also `NO_COLOR=1`
  when piping).
- Exit code `0` on success, `1` on error.

## Conventions

| Convention  | Meaning                                                          |
| ----------- | ---------------------------------------------------------------- |
| `-j, --json`| Machine-readable JSON output — always use this in scripts/agents |
| `--dry-run` | Print the mutation without writing it (supported where noted)    |
| `--no-color`| Strip ANSI colors from output                                    |

The CLI has **no destructive commands**: there is no note/folder/link delete.
The only mutations are create/append/toggle and Git sync.

AI agents should follow this loop: inspect with `--json`, preview with
`--dry-run`, then execute.

## `lyra status`

Vault statistics and configuration.

```bash
lyra status            # folders, todos, links, daily logs, AI provider, sync
lyra status --json     # { repoPath, git: {isRepo, remote}, stats, config }
```

## `lyra note` (alias `notes`)

```bash
lyra note list               # all notes, grouped by folder
lyra note list Engineering   # notes in one folder
lyra note list --json        # [{ folder, filename, title, updatedAt }]

lyra note show "Engineering/Debugging-Playbook.md"   # print raw Markdown (alias: cat)
lyra note show "My-Note"     # .md extension optional

lyra note new "Architecture Decision Records" \
  -f Engineering \
  -c "# ADRs" \
  --dry-run
```

`note new <title...>` options:

| Option             | Effect                                                     |
| ------------------ | ---------------------------------------------------------- |
| `-f, --folder`     | Target folder (default `/`)                                |
| `-c, --content`    | Initial Markdown body (default `# <title>`)                |
| `--force`          | Overwrite an existing note                                 |
| `--dry-run`        | Show the file that would be created                        |

The filename is derived from the title (`Architecture Plan` →
`architecture-plan.md`).

## `lyra today` (alias `myday`)

Today's Daily Log (`myday/YYYY-MM-DD.md`).

```bash
lyra today show                       # print today's log
lyra today append "Standup done"      # append a line (alias: add)
lyra today append "- [ ] Call Alice @due(2026-09-01)" --dry-run
```

## `lyra todo` (aliases `todos`, `task`, `tasks`)

```bash
lyra todo list                                    # pending tasks only
lyra todo list --all                              # include completed
lyra todo list --status in_progress --json
lyra todo list -p high -f Engineering --all
```

`todo list` options:

| Option                 | Effect                                                        |
| ---------------------- | ------------------------------------------------------------- |
| `--status <status>`    | `todo` \| `in_progress` \| `urgent` \| `question` \| `paused` \| `done` \| `all` |
| `-p, --priority`       | `high` \| `medium` \| `low`                                   |
| `-f, --folder`         | Filter by folder                                              |
| `-a, --all`            | Include completed tasks                                       |
| `-j, --json`           | Structured JSON (includes `folderName`, `filename`, `index`)  |

Without filters only pending tasks are shown.

```bash
lyra todo add "Review the quarterly roadmap" --today -p high
lyra todo add "Fix flaky test" -f Engineering --file Testing.md -d 2026-09-01
lyra todo toggle Engineering "Testing.md" 3 --dry-run
```

`todo add <text...>` options:

| Option            | Effect                                                          |
| ----------------- | --------------------------------------------------------------- |
| `--today`         | Append to today's Daily Log (default when no folder/file given) |
| `-f, --folder`    | Target note folder (used with `--file`)                         |
| `--file <file>`   | Target note filename (default `Inbox.md`)                       |
| `-p, --priority`  | `high` \| `medium` \| `low` (writes `#high` / `#low`)           |
| `-d, --due`       | Due date `YYYY-MM-DD` (writes `@due(...)`)                      |
| `--dry-run`       | Preview the appended line                                       |

The appended line is `- [ ] <text> [#high|#low] [@due(...)]`. A missing target
note is created automatically with a `# <Title>` header.

`todo toggle <folder> <file> <number>` flips done ↔ pending. `<number>` is the
`#N` shown by `lyra todo list` (1-based, per note). Supports `--dry-run`.
Toggling is the only way tasks get completed from the CLI.

## `lyra links` (alias `link`)

```bash
lyra links list                        # all bookmarks + links from notes
lyra links list --filter manual        # or --manual / --notes
lyra links list --notes --json

lyra links add "https://bun.sh" "Bun Runtime" -d "Fast JavaScript runtime" --dry-run
lyra links add "https://example.com"   # title becomes the URL
```

`links list --filter` accepts `all` | `notes` | `manual` (`--notes` /
`--manual` are shorthand; do not combine them with `--filter`).

## `lyra graph` (alias `graphs`)

Knowledge-graph queries over wikilinks, embeds, and Markdown links.

```bash
lyra graph stats                            # notes, edges, unresolved, orphans
lyra graph stats --json

lyra graph show "Architecture Decision Records" --depth 2 --json   # neighborhood

lyra graph nodes                            # all notes with connection counts
lyra graph nodes --orphans                  # notes with 0 connections
lyra graph nodes --unresolved               # phantom links (target missing)
lyra graph nodes -t work --sort connections --json

lyra graph edges --type wikilink --json     # alias: links
lyra graph backlinks "Architecture Decision Records" --json

lyra graph export vault-graph.mmd           # Mermaid (from extension)
lyra graph export graph.json --note "My Note" --depth 1
lyra graph export -f dot                    # stdout, Graphviz DOT
```

| Command            | Options                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `stats`            | `-j, --json`                                                              |
| `show <note...>`   | `-d, --depth <1\|2>` (default 1), `-j, --json`                            |
| `nodes`            | `--unresolved` (`--missing`), `--orphans`, `-t, --tag`, `-s, --sort connections\|in\|out\|title`, `-j, --json` |
| `edges`            | `--source <note>`, `--target <note>`, `--type wikilink\|embed\|markdown`, `-j, --json` |
| `backlinks <note...>` | `-j, --json` (includes context snippets)                               |
| `export [file]`    | `-f, --format json\|mermaid\|dot` (inferred from extension: `.json`, `.mmd`, `.dot`), `-n, --note <note>` (local subgraph), `-d, --depth` |

## `lyra sync` and `lyra daemon`

Git-backed synchronization. Requires the vault to be a Git repository with a
remote.

```bash
lyra sync --dry-run     # preview: "would pull from, push to Git remote"
lyra sync               # pull + push (default)
lyra sync --pull        # pull only
lyra sync --push        # push only

lyra daemon             # foreground auto-sync, Ctrl+C to stop
lyra sync --daemon      # equivalent
lyra daemon --dry-run
```

- `--pull`, `--push`, `--daemon` are mutually exclusive; with none given, sync
  pulls **and** pushes.
- The daemon interval is `autoSyncIntervalMins` from the vault config
  (default: 5 minutes) and runs in the foreground until interrupted. See
  [`lyra-config`](../lyra-config/SKILL.md) for sync settings.

## Automation And AI-Agent Playbook

1. **Inspect** with JSON and no color:
   `lyra todo list --json | jq '[.[] | select(.priority == "High")]'`
2. **Preview** every mutation: `lyra todo add ... --dry-run`,
   `lyra note new ... --dry-run`, `lyra sync --dry-run`.
3. **Execute** only after the preview matches the intent.
4. Read note content via `lyra note show <path>` (raw Markdown, pipe-safe with
   `--no-color`); write full-file changes by editing the Markdown file itself —
   the CLI cannot delete or replace note bodies.
5. Prefer `graph backlinks --json` / `graph show --json` to build context about
   a note before modifying it.

Safety rules:

- Never parse colored output; always pass `--no-color` (or `NO_COLOR=1`) in
  pipelines.
- `--dry-run` prints exactly what would be written; treat any mismatch as a
  stop condition.
- `lyra sync` mutates the Git remote — always rehearse with `--dry-run` and
  check `lyra status --json` first.
