# Claude Code Statusline

This directory contains a reusable Claude Code status line setup for using
`claude-hud` together with Codex usage data.

It is based on `claude-hud`, with two small adapters:

- `codex-usage-adapter.mjs` reads Codex app-server rate limits and writes a
  claude-hud compatible external usage JSON file.
- `context-window-adapter.mjs` adjusts the displayed context window when
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW` is set.

## Install

Install or update the local Claude Code status line files:

```bash
node examples/claude-code/statusline/install.mjs
```

The installer writes files under:

```text
${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud
```

It also updates `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json` with a
`statusLine.command` entry. Existing unrelated settings are preserved.

Preview changes without writing files:

```bash
node examples/claude-code/statusline/install.mjs --dry-run
```

Skip `settings.json` updates and only copy adapter/config files:

```bash
node examples/claude-code/statusline/install.mjs --no-settings
```

## Requirements

- Claude Code
- `claude-hud` plugin installed in Claude Code
- `codex` CLI available to run `codex app-server --listen stdio://`
- Node.js

## Test

```bash
node examples/claude-code/statusline/codex-usage-adapter.test.mjs
```

## How It Works

The installed status line command does this on each render:

1. Calculates the terminal width and reserves a small margin.
2. Runs `codex-usage-adapter.mjs` to refresh `codex-usage.json`.
3. Finds the installed `claude-hud` plugin bundle from Claude's plugin cache.
4. Pipes Claude Code status input through `context-window-adapter.mjs`.
5. Runs `claude-hud` with the adapted input.

The command intentionally ignores Codex usage refresh failures so the status
line can still render when Codex is offline.
