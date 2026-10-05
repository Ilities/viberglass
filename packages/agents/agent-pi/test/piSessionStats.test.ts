import { parsePiSessionStats } from "../src/piSessionStats";

describe("parsePiSessionStats", () => {
  it("reads the session's tokens and cost from pi-acp's /session answer", () => {
    const answer = "Session: abc\nSession file: /home/x/.pi/s.jsonl\nMessages: 12\nCost: 0.0123\nTokens: in 2410, out 310, cache read 1200, cache write 0, total 3920";
    expect(parsePiSessionStats(answer)).toEqual({
      inputTokens: 2410,
      outputTokens: 310,
      cacheReadInputTokens: 1200,
      cacheCreationInputTokens: 0,
      costUsd: 0.0123,
    });
  });

  it("keeps what it can read, and nothing from an answer without totals", () => {
    expect(parsePiSessionStats("Messages: 2\nTokens: in 5, out 1, total 6")).toEqual({
      inputTokens: 5,
      outputTokens: 1,
      cacheReadInputTokens: undefined,
      cacheCreationInputTokens: undefined,
      costUsd: undefined,
    });
    expect(parsePiSessionStats("Session stats:\n{}")).toBeNull();
  });

  it("leaves out a zero cost for real tokens, which is Pi not knowing a custom model's price", () => {
    expect(parsePiSessionStats("Cost: 0\nTokens: in 2410, out 310, total 2720")?.costUsd).toBeUndefined();
    expect(parsePiSessionStats("Cost: 0\nTokens: in 0, out 0, total 0")?.costUsd).toBe(0);
  });
});
