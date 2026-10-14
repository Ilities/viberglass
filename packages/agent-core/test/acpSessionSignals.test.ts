import { contextUsageOf, promptUsageOf } from "../src/acp/acpSessionSignals";

describe("promptUsageOf", () => {
  it("counts cached tokens as part of the context, as harnesses that cache report them apart", () => {
    expect(promptUsageOf({ usage: { inputTokens: 312, outputTokens: 900, cachedReadTokens: 41_000, cachedWriteTokens: 2_000 } })).toEqual({
      used: 43_312,
      size: null,
    });
  });

  it("reads input tokens alone when nothing was cached, and the total when there are no input tokens", () => {
    expect(promptUsageOf({ usage: { inputTokens: 5_000 } })).toEqual({ used: 5_000, size: null });
    expect(promptUsageOf({ usage: { totalTokens: 7_000 } })).toEqual({ used: 7_000, size: null });
    expect(promptUsageOf({ stopReason: "end_turn" })).toBeNull();
  });
});

describe("contextUsageOf", () => {
  it("reads a usage_update's tokens and window", () => {
    expect(contextUsageOf({ update: { sessionUpdate: "usage_update", used: 43_000, size: 128_000 } })).toEqual({ used: 43_000, size: 128_000 });
  });
});
