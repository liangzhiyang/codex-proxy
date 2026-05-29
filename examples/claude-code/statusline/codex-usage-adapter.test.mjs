import test from "node:test";
import assert from "node:assert/strict";

import {
  convertCodexRateLimitsToHudSnapshot,
  parseJsonRpcResponseLines,
  selectCodexRateLimitSnapshot,
} from "./codex-usage-adapter.mjs";

const codexSnapshot = {
  limitId: "codex",
  limitName: null,
  primary: {
    usedPercent: 2,
    windowDurationMins: 300,
    resetsAt: 1700000000,
  },
  secondary: {
    usedPercent: 3,
    windowDurationMins: 10080,
    resetsAt: 1700600000,
  },
  credits: {
    hasCredits: false,
    unlimited: false,
    balance: "0",
  },
  planType: "pro",
  rateLimitReachedType: null,
};

test("selects the codex rate limit bucket when multiple buckets exist", () => {
  const response = {
    rateLimits: { ...codexSnapshot, limitId: "legacy" },
    rateLimitsByLimitId: {
      codex_bengalfox: {
        ...codexSnapshot,
        limitId: "codex_bengalfox",
        primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: 1700100000 },
        secondary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: 1700700000 },
      },
      codex: codexSnapshot,
    },
  };

  assert.equal(selectCodexRateLimitSnapshot(response), codexSnapshot);
});

test("converts Codex primary and secondary windows to Claude HUD external usage format", () => {
  const response = {
    rateLimits: codexSnapshot,
    rateLimitsByLimitId: null,
  };

  assert.deepEqual(convertCodexRateLimitsToHudSnapshot(response, new Date("2026-05-26T10:00:00.000Z")), {
    updated_at: "2026-05-26T10:00:00.000Z",
    five_hour: {
      used_percentage: 2,
      resets_at: "2023-11-14T22:13:20.000Z",
    },
    seven_day: {
      used_percentage: 3,
      resets_at: "2023-11-21T20:53:20.000Z",
    },
  });
});

test("parses JSON-RPC line output and returns the requested response result", () => {
  const lines = [
    JSON.stringify({ id: 1, result: { ok: true } }),
    JSON.stringify({ method: "remoteControl/status/changed", params: { status: "disabled" } }),
    JSON.stringify({ id: 2, result: { rateLimits: codexSnapshot, rateLimitsByLimitId: null } }),
  ].join("\n");

  assert.deepEqual(parseJsonRpcResponseLines(lines, 2), {
    rateLimits: codexSnapshot,
    rateLimitsByLimitId: null,
  });
});
