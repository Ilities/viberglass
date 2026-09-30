import * as path from "path";
import { createLogger, transports } from "winston";
import { AcpClient } from "../src/acp/AcpClient";
import type { PlatformSessionEvent } from "../src/acp/types";

const AGENT_SCRIPT = path.join(process.cwd(), "test", "fixtures", "permissionAskingAgent.cjs");

describe("AcpClient permission requests", () => {
  it("answers with the spec's outcome shape, selecting the harness's own allow option", async () => {
    const events: PlatformSessionEvent[] = [];
    const client = new AcpClient(
      [process.execPath, AGENT_SCRIPT],
      process.cwd(),
      process.env,
      (event) => events.push(event),
      createLogger({ transports: [new transports.Console({ silent: true })] }),
      10_000,
    );

    await client.run({ userMessage: "Read a file outside the repo" });

    const reply = events.find((event) => event.eventType === "assistant_message");
    expect(JSON.parse(String(reply?.payload.text))).toEqual({
      outcome: { outcome: "selected", optionId: "once" },
    });
    expect(events).toContainEqual({
      eventType: "progress",
      payload: { text: "Permission auto-approved: external_directory /tmp/other" },
    });
  });
});
