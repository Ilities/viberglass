import { createLogger, format, transports, type Logger } from "winston";
import { CallbackClient } from "../infrastructure/CallbackClient";
import { LogForwarder } from "./LogForwarder";

type ForwardedLog = {
  level: "info" | "warn" | "error" | "debug";
  message: string;
  source?: string;
  internal?: boolean;
};

class TestCallbackClient extends CallbackClient {
  public readonly batches: Array<{
    jobId: string;
    tenantId: string;
    logs: ForwardedLog[];
  }> = [];

  constructor(logger: Logger) {
    super(logger, { platformUrl: "http://localhost:9999" });
  }

  override async sendLogBatch(
    jobId: string,
    tenantId: string,
    logs: ForwardedLog[],
  ): Promise<void> {
    this.batches.push({ jobId, tenantId, logs });
  }
}

function createSilentLogger(logFormat: ReturnType<typeof format.printf>): Logger;
function createSilentLogger(
  logFormat?: ReturnType<typeof format.json>,
): Logger;
function createSilentLogger(
  logFormat: ReturnType<typeof format.printf> | ReturnType<typeof format.json> = format.json(),
): Logger {
  return createLogger({
    level: "info",
    format: logFormat,
    transports: [new transports.Console({ silent: true })],
  });
}

describe("LogForwarder", () => {
  test("forwards structured winston logs as batch entries", async () => {
    const logger = createSilentLogger();
    const callbackClient = new TestCallbackClient(logger);
    const forwarder = new LogForwarder(logger, callbackClient, 10, 10000);

    forwarder.setupForJob("job-1", "tenant-1");
    logger.info("agent started");
    logger.warn("running tests");
    forwarder.flush();

    expect(callbackClient.batches).toHaveLength(1);
    expect(callbackClient.batches[0]?.jobId).toBe("job-1");
    expect(callbackClient.batches[0]?.tenantId).toBe("tenant-1");
    expect(callbackClient.batches[0]?.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: "info", message: "agent started" }),
        expect.objectContaining({ level: "warn", message: "running tests" }),
      ]),
    );

    forwarder.cleanup();
  });

  test("splits multiline plain-text chunks and filters internal logs", async () => {
    const logger = createSilentLogger(
      format.printf(({ level, message }) => `${level}: ${String(message)}`),
    );
    const callbackClient = new TestCallbackClient(logger);
    const forwarder = new LogForwarder(logger, callbackClient, 10, 10000);

    forwarder.setupForJob("job-2", "tenant-2");
    logger.info("first line\nsecond line");
    logger.info("[internal] callback retry");
    forwarder.flush();

    expect(callbackClient.batches).toHaveLength(1);
    const messages = callbackClient.batches[0]?.logs.map((log) => log.message) ?? [];
    expect(messages.some((message) => message.includes("first line"))).toBe(true);
    expect(messages.some((message) => message.includes("second line"))).toBe(
      true,
    );
    expect(
      messages.some((message) => message.includes("[internal]")),
    ).toBe(false);

    forwarder.cleanup();
  });

  test("stops forwarding once cleanup removes the transport", async () => {
    const logger = createSilentLogger();
    const callbackClient = new TestCallbackClient(logger);
    const forwarder = new LogForwarder(logger, callbackClient, 10, 10000);

    forwarder.setupForJob("job-3", "tenant-3");
    logger.info("before cleanup");
    forwarder.flush();
    expect(callbackClient.batches).toHaveLength(1);

    forwarder.cleanup();

    logger.info("after cleanup");
    forwarder.flush();
    expect(callbackClient.batches).toHaveLength(1);
  });
});
