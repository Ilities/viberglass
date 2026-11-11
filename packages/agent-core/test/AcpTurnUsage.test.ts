import { AcpSessionUsage, type AcpSessionUsageReader } from "../src/acp/AcpSessionUsage";
import { AcpTurnUsage } from "../src/acp/AcpTurnUsage";

const costUpdate = (amount: number) => ({ sessionId: "s", update: { sessionUpdate: "usage_update", used: 1000, size: 200000, cost: { amount, currency: "USD" } } });

describe("AcpTurnUsage", () => {
  it("adds up each prompt's tokens and takes the cost the fresh session grew to", () => {
    const usage = new AcpTurnUsage();
    usage.noteInitialized({ agentInfo: { name: "opencode", version: "1.18.34" } });
    usage.startTurn(true);
    usage.notePromptResult({ stopReason: "end_turn", usage: { inputTokens: 2410, outputTokens: 310, thoughtTokens: 40, cachedReadTokens: 1200, totalTokens: 3960 } });
    usage.noteSessionUpdate(costUpdate(0.012));
    usage.notePromptResult({ stopReason: "end_turn", usage: { inputTokens: 100, outputTokens: 20 } });

    expect(usage.report()).toEqual({
      inputTokens: 2510,
      outputTokens: 330,
      reasoningOutputTokens: 40,
      cacheReadInputTokens: 1200,
      cacheCreationInputTokens: undefined,
      costUsd: 0.012,
      harnessVersion: "1.18.34",
    });
  });

  it("counts a continued session's cost from what it had cost before the turn", () => {
    const usage = new AcpTurnUsage();
    usage.noteSessionUpdate(costUpdate(0.5));
    usage.startTurn(false);
    usage.noteSessionUpdate(costUpdate(0.53));
    expect(usage.report()?.costUsd).toBeCloseTo(0.03);
  });

  it("leaves the cost out when a continued session's earlier cost is unknown, and reports nothing when the harness said nothing", () => {
    const continued = new AcpTurnUsage();
    continued.startTurn(false);
    continued.notePromptResult({ usage: { inputTokens: 10, outputTokens: 5 } });
    continued.noteSessionUpdate(costUpdate(0.9));
    expect(continued.report()).not.toHaveProperty("costUsd");
    expect(continued.report()).toHaveProperty("costUnknown", true);

    const silent = new AcpTurnUsage();
    silent.startTurn(true);
    silent.notePromptResult({ stopReason: "end_turn" });
    expect(silent.report()).toBeUndefined();
  });

  it("takes the cost the harness recorded for each model call over what its updates could tell", () => {
    const usage = new AcpTurnUsage();
    usage.startTurn(false);
    usage.notePromptResult({ usage: { inputTokens: 10, outputTokens: 5 } });
    usage.noteSessionUpdate(costUpdate(0.9));
    usage.noteRecordedUsage({ inputTokens: 5400, outputTokens: 2100, costUsd: 0.04 });

    expect(usage.report()).toMatchObject({ inputTokens: 5400, outputTokens: 2100, costUsd: 0.04 });
    expect(usage.report()).not.toHaveProperty("costUnknown");
  });

  it("adds what a continued session spent before the turn gave up on it to the fresh session's cost", () => {
    const usage = new AcpTurnUsage();
    usage.noteSessionUpdate(costUpdate(0.5));
    usage.startTurn(false);
    usage.noteSessionUpdate(costUpdate(0.53));
    usage.startTurn(true);
    expect(usage.report()?.costUsd).toBeCloseTo(0.03);

    usage.noteSessionUpdate(costUpdate(0.02));
    expect(usage.report()?.costUsd).toBeCloseTo(0.05);
  });

  it("can't tell the turn's cost when a session it gave up on spent an unknown amount", () => {
    const usage = new AcpTurnUsage();
    usage.startTurn(false);
    usage.noteSessionUpdate(costUpdate(0.9));
    usage.startTurn(true);
    usage.notePromptResult({ usage: { inputTokens: 10 } });
    usage.noteSessionUpdate(costUpdate(0.02));
    expect(usage.report()).toMatchObject({ inputTokens: 10, costUnknown: true });
    expect(usage.report()).not.toHaveProperty("costUsd");
  });

  it("takes a turn's tokens and cost from what the session's totals grew by, when the prompts said nothing", () => {
    const usage = new AcpTurnUsage();
    usage.startTurn(false);
    usage.notePromptResult({ stopReason: "end_turn" });
    usage.noteTotals(
      { inputTokens: 1000, outputTokens: 100, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0.01 },
      { inputTokens: 3410, outputTokens: 410, cacheReadInputTokens: 1200, cacheCreationInputTokens: 0, costUsd: 0.0223 },
    );
    expect(usage.report()).toMatchObject({ inputTokens: 2410, outputTokens: 310, cacheReadInputTokens: 1200, cacheCreationInputTokens: 0 });
    expect(usage.report()?.costUsd).toBeCloseTo(0.0123);
  });

  it("keeps the tokens the prompts reported over the totals, and ignores totals it couldn't read", () => {
    const usage = new AcpTurnUsage();
    usage.startTurn(true);
    usage.notePromptResult({ usage: { inputTokens: 10, outputTokens: 2 } });
    usage.noteTotals({ inputTokens: 0, outputTokens: 0 }, { inputTokens: 99, outputTokens: 99 });
    expect(usage.report()).toMatchObject({ inputTokens: 10, outputTokens: 2 });

    const unread = new AcpTurnUsage();
    unread.startTurn(false);
    unread.noteTotals(null, { inputTokens: 5 });
    expect(unread.report()).toBeUndefined();
  });

  it("adds up each model call's usage from the updates' _meta when the prompt's result has none, as Qwen Code reports it", () => {
    const usage = new AcpTurnUsage();
    usage.startTurn(true);
    const call = (inputTokens: number, outputTokens: number) => ({
      sessionId: "s",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "" }, _meta: { usage: { inputTokens, outputTokens, thoughtTokens: 0, cachedReadTokens: 0 } } },
    });
    usage.noteMessageUsage(call(14712, 44));
    usage.noteMessageUsage(call(14809, 135));
    usage.noteMessageUsage({ sessionId: "s", update: { sessionUpdate: "usage_update", used: 14809, size: 32768 } });
    usage.notePromptResult({ stopReason: "end_turn" });

    expect(usage.report()).toMatchObject({ inputTokens: 29521, outputTokens: 179, reasoningOutputTokens: 0, cacheReadInputTokens: 0 });
  });

  it("prefers the prompt's own usage over the model calls'", () => {
    const usage = new AcpTurnUsage();
    usage.startTurn(true);
    usage.noteMessageUsage({ update: { sessionUpdate: "agent_message_chunk", _meta: { usage: { inputTokens: 5, outputTokens: 1 } } } });
    usage.notePromptResult({ stopReason: "end_turn", usage: { inputTokens: 100, outputTokens: 20 } });
    expect(usage.report()).toMatchObject({ inputTokens: 100, outputTokens: 20 });
  });

  describe("for a harness whose prompt results carry the session's running totals", () => {
    const reader: AcpSessionUsageReader = {
      totalsOf: (update) => (update.sessionUpdate === "usage_update" && typeof update.input === "number" ? { inputTokens: update.input, outputTokens: 40, cachedReadTokens: 0 } : null),
    };
    const totals = (input: number) => ({ sessionId: "s", update: { sessionUpdate: "usage_update", input } });
    const result = (inputTokens: number, outputTokens: number) => ({ stopReason: "end_turn", usage: { inputTokens, outputTokens, cachedReadTokens: 0, totalTokens: inputTokens + outputTokens } });
    const cumulative = () => new AcpTurnUsage(new AcpSessionUsage(reader));

    it("counts a fresh session's first prompt as it is, and each later prompt by what the totals grew", () => {
      const usage = cumulative();
      usage.startTurn(true);
      usage.notePromptResult(result(1000, 100));
      usage.notePromptResult(result(1300, 130));
      expect(usage.report()).toMatchObject({ inputTokens: 1300, outputTokens: 130 });
    });

    it("counts a continued session's turn from the totals it reported when loaded", () => {
      const usage = cumulative();
      usage.noteSessionUpdate(totals(5000));
      usage.startTurn(false);
      usage.notePromptResult(result(5600, 90));
      expect(usage.report()).toMatchObject({ inputTokens: 600, outputTokens: 50, cacheReadInputTokens: 0 });
    });

    it("takes the loaded session's totals when they arrive just after the turn starts", () => {
      const usage = cumulative();
      usage.startTurn(false);
      usage.noteSessionUpdate(totals(5000));
      usage.noteSessionUpdate(totals(5300));
      usage.notePromptResult(result(5600, 90));
      expect(usage.report()).toMatchObject({ inputTokens: 600 });
    });

    it("leaves a continued session's tokens out when it never said what it had used", () => {
      const usage = cumulative();
      usage.startTurn(false);
      usage.notePromptResult(result(5600, 90));
      expect(usage.report()).toBeUndefined();
    });

    it("starts over at nothing in the fresh session a turn falls back to", () => {
      const usage = cumulative();
      usage.noteSessionUpdate(totals(5000));
      usage.startTurn(false);
      usage.startTurn(true);
      usage.notePromptResult(result(800, 60));
      expect(usage.report()).toMatchObject({ inputTokens: 800, outputTokens: 60 });
    });
  });
});
