import * as path from "path";
import { createLogger, transports } from "winston";
import { AcpClient } from "../src/acp/AcpClient";
import type { PlatformSessionEvent } from "../src/acp/types";

const AGENT_SCRIPT = path.join(process.cwd(), "test", "fixtures", "stallingAgent.cjs");

function runTurn(env: Record<string, string>, timeoutMs: number, stallAfterMs?: number, onEvent: (event: PlatformSessionEvent) => void = () => {}) {
  const client = new AcpClient(
    [process.execPath, AGENT_SCRIPT],
    process.cwd(),
    { ...process.env, ...env },
    onEvent,
    createLogger({ transports: [new transports.Console({ silent: true })] }),
    timeoutMs,
    undefined,
    undefined,
    stallAfterMs,
  );
  return client.run({ userMessage: "Carry on" });
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
});
