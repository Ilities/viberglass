import { AgentSessionMutex } from "../../../services/agentSession/AgentSessionMutex";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("AgentSessionMutex", () => {
  let mutex: AgentSessionMutex;

  beforeEach(() => {
    mutex = new AgentSessionMutex();
  });

  it("serializes tasks for the same session", async () => {
    const order: string[] = [];
    const gate = deferred<void>();

    const first = mutex.runExclusive("s1", async () => {
      order.push("first:start");
      await gate.promise;
      order.push("first:end");
      return "a";
    });

    const second = mutex.runExclusive("s1", async () => {
      order.push("second:start");
      order.push("second:end");
      return "b";
    });

    // Let microtasks settle — second must not start while first is pending
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["first:start"]);

    gate.resolve();
    await expect(first).resolves.toBe("a");
    await expect(second).resolves.toBe("b");
    expect(order).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  it("runs tasks for different sessions concurrently", async () => {
    const order: string[] = [];
    const gate = deferred<void>();

    const first = mutex.runExclusive("s1", async () => {
      order.push("s1:start");
      await gate.promise;
      order.push("s1:end");
    });

    const second = mutex.runExclusive("s2", async () => {
      order.push("s2:start");
      order.push("s2:end");
    });

    await second;
    expect(order).toEqual(["s1:start", "s2:start", "s2:end"]);

    gate.resolve();
    await first;
    expect(order).toEqual(["s1:start", "s2:start", "s2:end", "s1:end"]);
  });

  it("does not deadlock the next task when one rejects", async () => {
    const failing = mutex.runExclusive("s1", async () => {
      throw new Error("boom");
    });
    await expect(failing).rejects.toThrow("boom");

    await expect(
      mutex.runExclusive("s1", async () => "recovered"),
    ).resolves.toBe("recovered");
  });
});
