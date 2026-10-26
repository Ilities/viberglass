import * as path from "path";
import { createLogger, transports } from "winston";
import { AcpClient } from "../src/acp/AcpClient";

const AGENT_SCRIPT = path.join(process.cwd(), "test", "fixtures", "stallingAgent.cjs");

function runTurn(env: Record<string, string>, timeoutMs: number) {
  const client = new AcpClient(
    [process.execPath, AGENT_SCRIPT],
    process.cwd(),
    { ...process.env, ...env },
    () => {},
    createLogger({ transports: [new transports.Console({ silent: true })] }),
    timeoutMs,
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

  it("fails the turn when the harness exits partway", async () => {
    await expect(runTurn({ AGENT_EXIT_ON_PROMPT: "1" }, 10_000)).rejects.toThrow("Agent process exited unexpectedly (code 3)");
  });
});
