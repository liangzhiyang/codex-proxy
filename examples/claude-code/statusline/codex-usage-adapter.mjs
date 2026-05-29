#!/usr/bin/env node
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_PATH = new URL("./codex-usage.json", import.meta.url).pathname;
const REQUEST_ID_INITIALIZE = 1;
const REQUEST_ID_RATE_LIMITS = 2;

export function selectCodexRateLimitSnapshot(response) {
  const byId = response?.rateLimitsByLimitId;
  if (byId?.codex) {
    return byId.codex;
  }
  return response?.rateLimits ?? null;
}

function toPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(Math.min(100, Math.max(0, value)));
}

function toIsoFromUnixSeconds(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function convertCodexRateLimitsToHudSnapshot(response, now = new Date()) {
  const snapshot = selectCodexRateLimitSnapshot(response);
  if (!snapshot) {
    throw new Error("Codex rate limit response did not include a usable snapshot");
  }

  const fiveHourUsed = toPercent(snapshot.primary?.usedPercent);
  const sevenDayUsed = toPercent(snapshot.secondary?.usedPercent);
  if (fiveHourUsed === null && sevenDayUsed === null) {
    throw new Error("Codex rate limit snapshot did not include primary or secondary usage");
  }

  const output = {
    updated_at: now.toISOString(),
  };

  if (fiveHourUsed !== null) {
    output.five_hour = {
      used_percentage: fiveHourUsed,
      resets_at: toIsoFromUnixSeconds(snapshot.primary?.resetsAt),
    };
  }

  if (sevenDayUsed !== null) {
    output.seven_day = {
      used_percentage: sevenDayUsed,
      resets_at: toIsoFromUnixSeconds(snapshot.secondary?.resetsAt),
    };
  }

  return output;
}

export function parseJsonRpcResponseLines(output, requestId) {
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (message.id === requestId) {
      if (message.error) {
        throw new Error(message.error.message ?? "Codex app-server returned an error");
      }
      return message.result;
    }
  }

  throw new Error(`Codex app-server response ${requestId} was not found`);
}

export async function readCodexRateLimits() {
  return await new Promise((resolve, reject) => {
    const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let initialized = false;
    let settled = false;
    const timeout = setTimeout(() => {
      finish(new Error("Timed out waiting for Codex rate limits"));
    }, 10000);

    function finish(error, result) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      child.stdin.end();
      child.kill("SIGTERM");
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    }

    function send(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
      for (const line of stdout.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id === REQUEST_ID_INITIALIZE && !initialized) {
          initialized = true;
          send({ id: REQUEST_ID_RATE_LIMITS, method: "account/rateLimits/read" });
        }
        if (message.id === REQUEST_ID_RATE_LIMITS) {
          try {
            finish(null, parseJsonRpcResponseLines(stdout, REQUEST_ID_RATE_LIMITS));
          } catch (error) {
            finish(error);
          }
        }
      }
    });

    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });

    child.on("error", error => {
      finish(error);
    });

    child.on("exit", code => {
      if (!settled && code !== 0) {
        finish(new Error(stderr.trim() || `Codex app-server exited with code ${code}`));
      }
    });

    send({
      id: REQUEST_ID_INITIALIZE,
      method: "initialize",
      params: {
        clientInfo: {
          name: "claude-hud-codex-usage-adapter",
          version: "0.1.0",
        },
      },
    });
  });
}

export async function writeHudUsageSnapshot(outputPath = DEFAULT_OUTPUT_PATH) {
  const rateLimits = await readCodexRateLimits();
  const snapshot = convertCodexRateLimitsToHudSnapshot(rateLimits);
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputPath = process.argv[2] ?? DEFAULT_OUTPUT_PATH;
  try {
    const snapshot = await writeHudUsageSnapshot(outputPath);
    process.stdout.write(`${JSON.stringify(snapshot)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
