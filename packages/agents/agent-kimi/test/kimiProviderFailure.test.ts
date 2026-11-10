import { kimiProviderRetry, kimiTurnError } from "../src/kimiProviderFailure";

const T = 1_794_320_382_474;

// Records as Kimi Code 2.5.3 writes them to agents/main/wire.jsonl.
const turnStarted = { turnId: 0, type: "agent.turn.started", time: T, kind: "event" };
const retrying = {
  type: "turn.step.retrying",
  agentId: "main",
  turnId: 0,
  step: 1,
  failedAttempt: 1,
  nextAttempt: 2,
  maxAttempts: 10,
  delayMs: 8_000_000,
  errorName: "APIProviderRateLimitError",
  errorMessage: "Go usage limit exceeded",
  statusCode: 429,
  time: T + 70,
};
const failed = {
  type: "turn.ended",
  agentId: "main",
  turnId: 0,
  reason: "failed",
  error: {
    code: "provider.rate_limit",
    message: "Go usage limit exceeded",
    name: "APIProviderRateLimitError",
    details: { statusCode: 429, requestId: null, traceId: null },
    retryable: true,
  },
  durationMs: 67,
  time: T + 90,
};

describe("Kimi Code provider failures", () => {
  test("reads the refusal Kimi waits out, and until when", () => {
    expect(kimiProviderRetry([turnStarted, retrying])).toEqual({
      at: T + 70,
      retryAt: T + 70 + 8_000_000,
      error: "Go usage limit exceeded",
      status: 429,
    });
  });

  test("finds no refusal in a session without one", () => {
    expect(kimiProviderRetry([turnStarted])).toBeUndefined();
  });

  test("says why a turn Kimi gave up on failed", () => {
    expect(kimiTurnError([turnStarted, retrying, failed])).toBe("Go usage limit exceeded (provider.rate_limit, HTTP 429)");
  });

  test("passes a turn that ended normally", () => {
    expect(kimiTurnError([turnStarted, failed, { type: "turn.ended", agentId: "main", turnId: 1, reason: "completed", time: T + 500 }])).toBeUndefined();
  });
});
