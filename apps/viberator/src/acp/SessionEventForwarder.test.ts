import { createLogger } from "winston";
import { SessionEventForwarder } from "./SessionEventForwarder";

const logger = createLogger({ silent: true });

describe("SessionEventForwarder", () => {
  it("sends one batch at a time, in order, and flush waits for those already on their way", async () => {
    const sent: string[] = [];
    const releases: Array<() => void> = [];
    const client = {
      sendSessionEventBatch: jest.fn((_jobId: string, _tenantId: string, batch: Array<{ payload: Record<string, unknown> }>) => {
        sent.push(batch.map((event) => String(event.payload.text)).join(""));
        return new Promise<void>((resolve) => releases.push(resolve));
      }),
    };
    const forwarder = new SessionEventForwarder(client, logger, 2, 1000);
    forwarder.setupForJob("job-1", "tenant");

    for (const text of ["a", "b", "c", "d"]) forwarder.enqueue({ eventType: "assistant_message", payload: { text } });
    await Promise.resolve();
    // The second full batch waits for the first to land.
    expect(sent).toEqual(["ab"]);

    let flushed = false;
    const flush = forwarder.flush().then(() => {
      flushed = true;
    });
    releases.shift()?.();
    await new Promise((resolve) => setImmediate(resolve));
    expect(sent).toEqual(["ab", "cd"]);
    expect(flushed).toBe(false);

    releases.shift()?.();
    await flush;
    expect(flushed).toBe(true);
  });

  it("keeps sending after a batch fails", async () => {
    const client = {
      sendSessionEventBatch: jest.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(undefined),
    };
    const forwarder = new SessionEventForwarder(client, logger, 1, 1000);
    forwarder.setupForJob("job-1", "tenant");

    forwarder.enqueue({ eventType: "assistant_message", payload: { text: "a" } });
    forwarder.enqueue({ eventType: "assistant_message", payload: { text: "b" } });
    await forwarder.flush();

    expect(client.sendSessionEventBatch).toHaveBeenCalledTimes(2);
  });
});
