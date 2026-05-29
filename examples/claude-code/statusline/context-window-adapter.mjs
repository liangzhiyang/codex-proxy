#!/usr/bin/env node

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}

const input = Buffer.concat(chunks).toString("utf8");
if (!input.trim()) {
  process.stdout.write(input);
  process.exit(0);
}

let data;
try {
  data = JSON.parse(input);
} catch {
  process.stdout.write(input);
  process.exit(0);
}

const configuredWindow = Number.parseInt(process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW ?? "", 10);
if (Number.isFinite(configuredWindow) && configuredWindow > 0 && data.context_window) {
  const usage = data.context_window.current_usage;
  const totalTokens =
    (usage?.input_tokens ?? 0) +
    (usage?.cache_creation_input_tokens ?? 0) +
    (usage?.cache_read_input_tokens ?? 0);

  data.context_window.context_window_size = configuredWindow;

  const used = Math.min(100, Math.max(0, Math.round((totalTokens / configuredWindow) * 100)));
  data.context_window.used_percentage = used;
  data.context_window.remaining_percentage = Math.max(0, 100 - used);
}

process.stdout.write(JSON.stringify(data));
