---
name: lyra-config
description: "Use when configuring Lyra: the vault location, config.json and .env settings, AI provider setup (OpenAI, Anthropic, Google, Ollama, custom, gateway), API keys, themes, language, and Git auto-sync. Triggers on: 'configure Lyra', 'lyra config', 'config.json', '.env', 'API key', 'AI provider', 'theme', 'language', 'auto sync', 'vault path', 'LYRA_REPO_PATH'."
---

# Lyra Config — Vault Settings Reference

Lyra stores its configuration **inside the vault**, not in `~/.config`. Two
files, two concerns:

- `<vault>/config.json` — plain settings, safe to commit (Git-tracked).
- `<vault>/.env` — secrets (API keys), auto-added to the vault `.gitignore`.

There are **no `lyra config` CLI commands**: change values through the TUI
command palette (theme, language), or edit the files directly. Inspect the
effective configuration with `lyra status`.

For vault operations see [`lyra-cli`](../lyra-cli/SKILL.md); for the
interactive interface see [`lyra-tui`](../lyra-tui/SKILL.md).

## Vault Location

Resolved by `getDefaultRepoPath()`; first match wins:

| Priority | Source                                | Result                                 |
| -------- | ------------------------------------- | -------------------------------------- |
| 1        | `LYRA_REPO_PATH` environment variable | That exact path (absolute or relative) |
| 2        | `NODE_ENV=test`                       | `~/.lyra_test`                         |
| 3        | `NODE_ENV=development` or `develop`   | `~/.lyra_dev`                          |
| 4        | default (`production`)                | `~/.lyra`                              |

`NODE_ENV` may also be picked up from a `.env` file in the working directory
at startup.

Additionally, a `customRepoPath` value in `config.json` redirects the vault:
the default vault keeps a one-line redirect config
(`{ "customRepoPath": "..." }`) and all settings are then read from the
custom path.

## Where Settings Live

```
<vault>/
├── config.json    # settings (language, provider, sync, theme, ...)
├── .env           # secrets (API keys) — auto-gitignored
└── .gitignore     # gains an ".env" line on first secret save
```

Load order on startup (last wins):

1. Built-in defaults (`autoSyncEnabled: false`, `autoSyncIntervalMins: 5`).
2. `<vault>/config.json` (legacy fallback: `settings.json` if no
   `config.json` exists).
3. `<customRepoPath>/config.json`, if a redirect is set.
4. `<vault>/.env` overlay — **`.env` values win over `config.json`** for the
   same key.

Legacy migration: an old `~/.config/lyra/config.json` (or
`$XDG_CONFIG_HOME/lyra/config.json`) is copied into the vault automatically
on first load.

Saving splits by field: non-secret settings go to `config.json`, secret
fields go to `.env` — secrets **never** land in `config.json`. An
empty-string secret value removes the entry from `.env`. Unrelated
variables already present in `.env` are preserved.

## `config.json` Reference

| Field                  | Type             | Default       | Description                                            |
| ---------------------- | ---------------- | ------------- | ------------------------------------------------------ |
| `language`             | `"en" \| "it"`   | `"en"`        | UI language (any `it*` value normalizes to `it`)       |
| `theme`                | string id        | `"dark"`      | Theme id (see Themes below)                            |
| `aiProvider`           | see AI Providers | auto-detected | Explicit provider; unset → detected from keys          |
| `aiModel`              | string           | per provider  | Global model override, takes precedence over defaults  |
| `autoSyncEnabled`      | boolean          | `false`       | Run Git auto-sync (`lyra daemon`)                      |
| `autoSyncIntervalMins` | number           | `5`           | Daemon sync interval in minutes                        |
| `customRepoPath`       | string           | —             | Vault redirect (stored in the default vault)           |
| `customBaseUrl`        | string           | —             | Base URL of an OpenAI-compatible endpoint (`custom`)   |

There is no schema validation: unknown keys are kept but ignored, and typos
fail silently. After editing by hand, verify with `lyra status --json`.

## `.env` Secrets Reference

| `.env` key           | Config field      | Used by                                           |
| -------------------- | ----------------- | ------------------------------------------------- |
| `OPENAI_API_KEY`     | `openaiApiKey`    | `openai`                                          |
| `OPENAI_TOKEN`       | `openaiToken`     | `openai` (alternate)                              |
| `ANTHROPIC_API_KEY`  | `anthropicApiKey` | `anthropic`                                       |
| `GOOGLE_API_KEY`     | `googleApiKey`    | `google`                                          |
| `GEMINI_API_KEY`     | `googleApiKey`    | `google` (alias)                                  |
| `CUSTOM_AI_API_KEY`  | `customApiKey`    | `custom`                                          |
| `CUSTOM_BASE_URL`    | `customBaseUrl`   | `custom` (not a secret — stored in `config.json`) |
| `AI_GATEWAY_API_KEY` | `aiGatewayKey`    | `gateway`                                         |
| `OLLAMA_URL`         | `ollamaUrl`       | `ollama`                                          |
| `OLLAMA_MODEL`       | `ollamaModel`     | `ollama`                                          |

Rules:

- `.env` is the source of truth for keys: it overlays `config.json` values.
- `.env` is appended to the vault `.gitignore` automatically on the first
  secret save; never commit it.
- Process environment variables work too (e.g. exporting `OPENAI_API_KEY`),
  as a fallback when the config fields are unset.

## AI Providers

Supported `aiProvider` values and their defaults:

| Provider    | Default model              | Key source (`config.json` / env)                                            | Notes                                              |
| ----------- | -------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `openai`    | `gpt-5.6-luna`             | `openaiApiKey` / `OPENAI_API_KEY`, `OPENAI_TOKEN`                           | Fallback provider when nothing is set              |
| `anthropic` | `claude-3-7-sonnet-latest` | `anthropicApiKey` / `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`             |                                                    |
| `google`    | `gemini-3.7-flash`         | `googleApiKey` / `GOOGLE_API_KEY`, `GEMINI_API_KEY`                         |                                                    |
| `ollama`    | `llama3.3`                 | `ollamaUrl`, `ollamaModel` (via `.env`)                                     | Base URL default `http://localhost:11434`          |
| `custom`    | `gpt-5.6-luna`             | `customApiKey` / `CUSTOM_AI_API_KEY`                                        | Any OpenAI-compatible endpoint via `customBaseUrl` |
| `gateway`   | `google/gemini-3.7-flash`  | `aiGatewayKey` / `AI_GATEWAY_API_KEY`                                       | Vercel AI Gateway                                  |

Provider detection when `aiProvider` is unset — first key found wins, in
this order: `anthropic` → `google` → `custom` (key or base URL) → `gateway`
→ `ollama` → `openai`. With no keys at all, the effective provider is
`openai` (and AI features stay disabled until a key exists).

Model resolution precedence: explicit request options → `config.aiModel` →
for `ollama`, `config.ollamaModel` → provider default model.

Minimal setups:

```bash
# OpenAI
echo 'OPENAI_API_KEY=sk-...' >> ~/.lyra/.env

# Anthropic
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> ~/.lyra/.env

# Ollama (local, no key needed — URL/model count as the "secret" fields)
printf 'OLLAMA_URL=http://localhost:11434\nOLLAMA_MODEL=llama3.3\n' >> ~/.lyra/.env

# Custom OpenAI-compatible endpoint (URL is written to config.json, key to .env)
printf 'CUSTOM_BASE_URL=https://my-endpoint/v1\nCUSTOM_AI_API_KEY=sk-...\n' >> ~/.lyra/.env
```

```jsonc
// ~/.lyra/config.json — pin a provider and model explicitly
{
  "aiProvider": "anthropic",
  "aiModel": "claude-3-7-sonnet-latest"
}
```

Verify the effective provider and model:

```bash
lyra status --json | jq '.config'
# { "language": "en", "aiProvider": "anthropic",
#   "aiModel": "claude-3-7-sonnet-latest",
#   "autoSyncEnabled": false, "autoSyncIntervalMins": 5 }
```

## Themes

Set from the TUI command palette (`Ctrl+P` → "Switch theme") — the choice
is persisted as `"theme": "<id>"` in `config.json` — or by editing the file
directly.

| id            | Theme                                    |
| ------------- | ---------------------------------------- |
| `dark`        | Lyra Dark (default)                      |
| `light`       | Lyra Light                               |
| `dracula`     | Dracula                                  |
| `nord`        | Nord                                     |
| `catppuccin`  | Catppuccin Mocha                         |
| `tokyo-night` | Tokyo Night                              |
| `monokai`     | Monokai Classic                          |
| `omarchy`     | Omarchy System (only on Omarchy systems) |

- An unknown theme id falls back to `dark`.
- On an Omarchy system the `omarchy` theme is generated from Omarchy's
  `colors.toml`, installed as a template at
  `~/.config/omarchy/themed/lyra.json.tpl`, and hot-reloads when the file
  changes — no restart needed.
- Without a `theme` value in `config.json`, Omarchy systems default to the
  `omarchy` theme, everything else to `dark`.

## Language

`"language": "en"` (default) or `"it"`. Switch from the command palette
(`Ctrl+P` → "Switch language") or edit `config.json`. The locale is read at
startup; the same value is also passed to AI prompts.

## Git Auto-Sync

```jsonc
// ~/.lyra/config.json
{
  "autoSyncEnabled": true,
  "autoSyncIntervalMins": 10
}
```

- Requires the vault to be a Git repository with a remote
  (`lyra sync --dry-run` to check).
- The daemon (`lyra daemon` / `lyra sync --daemon`) performs an initial
  sync ~10 s after start, then every `autoSyncIntervalMins` minutes, and
  skips sync when no remote is configured.
- Starting the daemon once enables `autoSyncEnabled` for the session.
- On first run the vault gets `git init`, a `.gitignore` (`.DS_Store`,
  `Thumbs.db`, `.env`, `.lyra/`), and an initial commit.

## Environment Variables Summary

| Variable          | Purpose                                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| `LYRA_REPO_PATH`  | Override the vault path entirely (highest priority)                         |
| `NODE_ENV`        | `production` (default) / `development` / `test` — selects the default vault |
| `NO_COLOR`        | Strip ANSI colors from CLI output (same as `--no-color`)                    |
| `XDG_CONFIG_HOME` | Only used for the legacy `~/.config/lyra` migration                         |
| Provider keys     | See the `.env` Secrets Reference table above                                |

## Notes For AI Agents

- **No validation**: `config.json` is blindly JSON-parsed and merged over
  defaults. Typos in keys or provider/theme ids fail silently — always
  re-read the file and run `lyra status --json` after writing.
- **Restart required**: configuration is loaded once at startup; file edits
  only take effect in a fresh `lyra` process (the TUI's own palette changes
  apply live because they go through `saveConfig()`).
- **Secret hygiene**: never write API keys into `config.json` (it is
  Git-tracked) — put them in `<vault>/.env`, which is auto-gitignored.
- **Inspect first**: `lyra status --json` reports the effective
  `repoPath`, `config`, Git state, and vault stats before you change
  anything.
- Prefer the palette-equivalent file edits in this order of safety:
  read → edit → `lyra status --json` → confirm the intended effective
  values.
