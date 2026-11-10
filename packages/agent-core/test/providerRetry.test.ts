import { providerRetryFailure } from "../src/acp/providerRetry";

const NOW = 1_794_320_000_000;
const MINUTE = 60_000;

describe("providerRetryFailure", () => {
  const retry = { at: NOW - MINUTE, error: "5h usage limit reached. It will reset in 2 hours 14 minutes.", retryAt: NOW + 134 * MINUTE };

  it("gives up on a wait longer than a run should take, saying how long it would be", () => {
    expect(providerRetryFailure(retry, NOW - 2 * MINUTE, NOW)).toBe(
      "The model provider refused the agent's request: 5h usage limit reached. It will reset in 2 hours 14 minutes. The agent would wait 2 hours 14 minutes to try again, so the run stopped.",
    );
  });

  it("names the HTTP status when the harness kept it", () => {
    expect(providerRetryFailure({ ...retry, error: "Rate limited", status: 429, retryAt: NOW + 6 * MINUTE }, NOW - 2 * MINUTE, NOW)).toBe(
      "The model provider refused the agent's request (HTTP 429): Rate limited. The agent would wait 6 minutes to try again, so the run stopped.",
    );
  });

  it("waits with the harness when it will try again within a few minutes", () => {
    expect(providerRetryFailure({ ...retry, retryAt: NOW + 4 * MINUTE }, NOW - 2 * MINUTE, NOW)).toBeUndefined();
  });

  it("leaves a refusal from before the turn alone", () => {
    expect(providerRetryFailure(retry, NOW, NOW)).toBeUndefined();
  });
});
