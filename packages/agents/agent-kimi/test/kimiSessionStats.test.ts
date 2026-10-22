import { parseKimiSessionStats } from "../src/kimiSessionStats";

describe("parseKimiSessionStats", () => {
  it("reads the session's tokens from Kimi's /usage answer", () => {
    const answer = "Context: 8353 / 32768 tokens (25%)\nSession total: 32529 input, 205 output";
    expect(parseKimiSessionStats(answer)).toEqual({ inputTokens: 32529, outputTokens: 205 });
  });

  it("reads counts written with thousands separators", () => {
    expect(parseKimiSessionStats("Session total: 1,032,529 input, 2,205 output")).toEqual({ inputTokens: 1032529, outputTokens: 2205 });
  });

  it("finds nothing in an answer without the session's totals", () => {
    expect(parseKimiSessionStats("Context: 8353 / 32768 tokens (25%)")).toBeNull();
  });
});
