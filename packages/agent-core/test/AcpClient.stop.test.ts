import * as path from "path";
import { createLogger, transports } from "winston";
import { AcpClient } from "../src/acp/AcpClient";
import type { PlatformSessionEvent } from "../src/acp/types";
import type { AcpProviderRetryReader } from "../src/acp/providerRetry";

const AGENT_SCRIPT = path.join(process.cwd(), "test", "fixtures", "stallingAgent.cjs");

function runTurn(
  env: Record<string, string>,
  timeoutMs: number,
  stallAfterMs?: number,
  onEvent: (event: PlatformSessionEvent) => void = () => {},
  providerRetries?: AcpProviderRetryReader,
) {
  const client = new AcpClient(
    [process.execPath, AGENT_SCRIPT],
    process.cwd(),
    { ...process.env, ...env },
    onEvent,
    createLogger({ transports: [new transports.Console({ silent: true })] }),
    timeoutMs,
    undefined,
    undefined,
    { stallAfterMs, providerRetryPollMs: 50 },
  );
  return client.run({ userMessage: "Carry on", providerRetries });
}

describe("AcpClient when the harness doesn't finish its turn", () => {
  it("fails the turn when it runs out of time", async () => {
    await expect(runTurn({}, 500)).rejects.toThrow(/Agent timed out/);
  });

  it("fails the turn on time even when the harness ignores SIGTERM", async () => {
    await expect(runTurn({ AGENT_IGNORE_TERM: "1" }, 500)).rejects.toThrow(/Agent timed out/);
  });

  it("fails the turn as stalled when the harness goes quiet", async () => {
    await expect(runTurn({}, 10_000, 300)).rejects.toThrow(/^Agent stalled: /);
  });

  it("warns the people watching halfway to the stall", async () => {
    const events: PlatformSessionEvent[] = [];
    await expect(runTurn({}, 10_000, 400, (event) => events.push(event))).rejects.toThrow(/^Agent stalled: /);
    expect(events.filter((event) => event.eventType === "progress").map((event) => event.payload.text)).toContainEqual(
      expect.stringMatching(/hasn't sent anything .* stops as stalled/),
    );
  });

  it("doesn't call a harness that keeps sending updates stalled", async () => {
    await expect(runTurn({ AGENT_CHATTER_MS: "50" }, 1_000, 300)).rejects.toThrow(/Agent timed out/);
  });

  it("fails the turn when the harness exits partway", async () => {
    await expect(runTurn({ AGENT_EXIT_ON_PROMPT: "1" }, 10_000)).rejects.toThrow("Agent process exited unexpectedly (code 3)");
  });

  describe("when the harness waits out a model provider's refusal", () => {
    const refusal = (waitMs: number): AcpProviderRetryReader => ({
      latest: (sessionId) =>
        sessionId === "sess_new" ? { at: Date.now(), retryAt: Date.now() + waitMs, error: "Go usage limit exceeded", status: 429 } : undefined,
    });

    it("fails the turn with the provider's error when the wait is hours long", async () => {
      await expect(runTurn({}, 10_000, undefined, undefined, refusal(2 * 3_600_000))).rejects.toThrow(
        "The model provider refused the agent's request (HTTP 429): Go usage limit exceeded. The agent would wait 2 hours to try again, so the run stopped.",
      );
    });

    it("lets the harness wait out a short one", async () => {
      await expect(runTurn({}, 600, undefined, undefined, refusal(60_000))).rejects.toThrow(/Agent timed out/);
    });
  });
});
