#!/usr/bin/env node
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import process from "node:process";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const updateSettings = !args.has("--no-settings");
const claudeDir = resolve(process.env.CLAUDE_CONFIG_DIR ?? join(os.homedir(), ".claude"));
const hudDir = join(claudeDir, "plugins", "claude-hud");
const settingsPath = join(claudeDir, "settings.json");
const usagePath = join(hudDir, "codex-usage.json");

const copiedFiles = [
  "codex-usage-adapter.mjs",
  "codex-usage-adapter.test.mjs",
  "context-window-adapter.mjs",
];

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function buildStatusLineCommand(nodePath) {
  const quotedNode = shellQuote(nodePath);
  return [
    "bash -lc",
    shellQuote([
      "cols=$(stty size </dev/tty 2>/dev/null | awk '{print $2}')",
      "export COLUMNS=$(( ${cols:-120} > 4 ? ${cols:-120} - 4 : 1 ))",
      `export CLAUDE_HUD_NODE=${quotedNode}`,
      'hud_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud"',
      '"$CLAUDE_HUD_NODE" "$hud_dir/codex-usage-adapter.mjs" "$hud_dir/codex-usage.json" >/dev/null 2>&1 || true',
      'plugin_index=$(ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud/*/dist/index.js 2>/dev/null | sort -V | tail -1)',
      'if [ -n "$plugin_index" ]; then "$CLAUDE_HUD_NODE" "$hud_dir/context-window-adapter.mjs" | exec "$CLAUDE_HUD_NODE" "$plugin_index"; fi',
    ].join("; ")),
  ].join(" ");
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(path, fallback) {
  if (!(await exists(path))) return fallback;
  const raw = await readFile(path, "utf8");
  if (!raw.trim()) return fallback;
  return JSON.parse(raw);
}

async function writeJsonFile(path, data) {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function installFiles() {
  console.log(`${dryRun ? "[dry-run] " : ""}Claude config dir: ${claudeDir}`);
  console.log(`${dryRun ? "[dry-run] " : ""}Claude HUD dir: ${hudDir}`);

  if (!dryRun) {
    await mkdir(hudDir, { recursive: true });
  }

  for (const file of copiedFiles) {
    const from = join(sourceDir, file);
    const to = join(hudDir, file);
    console.log(`${dryRun ? "[dry-run] would copy" : "copy"} ${from} -> ${to}`);
    if (!dryRun) {
      await copyFile(from, to);
    }
  }

  const configTemplate = await readFile(join(sourceDir, "config.template.json"), "utf8");
  const config = configTemplate.replace("__CLAUDE_HUD_EXTERNAL_USAGE_PATH__", usagePath);
  console.log(`${dryRun ? "[dry-run] would write" : "write"} ${join(hudDir, "config.json")}`);
  if (!dryRun) {
    await writeFile(join(hudDir, "config.json"), config, "utf8");
  }

  if (!(await exists(usagePath))) {
    const initialUsage = {
      updated_at: new Date(0).toISOString(),
      five_hour: { used_percentage: 0, resets_at: null },
      seven_day: { used_percentage: 0, resets_at: null },
    };
    console.log(`${dryRun ? "[dry-run] would write" : "write"} ${usagePath}`);
    if (!dryRun) {
      await writeJsonFile(usagePath, initialUsage);
    }
  }
}

async function installSettings() {
  if (!updateSettings) {
    console.log("skip settings.json update (--no-settings)");
    return;
  }

  const settings = await readJsonFile(settingsPath, {});
  settings.statusLine = {
    type: "command",
    command: buildStatusLineCommand(process.execPath),
  };

  console.log(`${dryRun ? "[dry-run] would update" : "update"} ${settingsPath}`);
  if (!dryRun) {
    await mkdir(claudeDir, { recursive: true });
    await writeJsonFile(settingsPath, settings);
  }
}

await installFiles();
await installSettings();

if (dryRun) {
  console.log("dry run complete; no files were changed");
} else {
  console.log("Claude Code status line files installed");
}
