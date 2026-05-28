import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetConfigForTesting } from "@src/config.js";
import { summarizeRequestForLog } from "@src/logs/request-summary.js";

describe("summarizeRequestForLog", () => {
  beforeEach(() => {
    resetConfigForTesting();
  });

  afterEach(() => {
    resetConfigForTesting();
  });

  it("summarizes Claude Code output_config effort for Anthropic messages", () => {
    const summary = summarizeRequestForLog("messages", {
      model: "gpt-5.4",
      stream: true,
      messages: [{ role: "user", content: "hello" }],
      thinking: { type: "enabled", budget_tokens: 25000 },
      output_config: { effort: "low" },
    });

    expect(summary).toMatchObject({
      body_type: "anthropic.messages",
      model: "gpt-5.4",
      stream: true,
      messages: 1,
      thinking: "enabled",
      thinking_budget_effort: "xhigh",
      output_config_effort: "low",
    });
    expect(summary).not.toHaveProperty("body");
  });
});
