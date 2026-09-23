import {
  isDatabaseUnreachable,
  retryWhileDatabaseUnreachable,
} from "../../../../api/startup/retryWhileDatabaseUnreachable";

function codedError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

describe("retryWhileDatabaseUnreachable", () => {
  it("retries until the database becomes reachable", async () => {
    const step = jest
      .fn()
      .mockRejectedValueOnce(codedError("EAI_AGAIN"))
      .mockRejectedValueOnce(codedError("ECONNREFUSED"))
      .mockResolvedValue("migrated");
    const onRetry = jest.fn();

    await expect(
      retryWhileDatabaseUnreachable(step, { attempts: 5, delayMs: 0, onRetry }),
    ).resolves.toBe("migrated");

    expect(step).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("fails immediately on errors that are not about reachability", async () => {
    const step = jest.fn().mockRejectedValue(new Error('relation "jobs" already exists'));

    await expect(
      retryWhileDatabaseUnreachable(step, { attempts: 5, delayMs: 0 }),
    ).rejects.toThrow("already exists");
    expect(step).toHaveBeenCalledTimes(1);
  });

  it("gives up after the last attempt", async () => {
    const step = jest.fn().mockRejectedValue(codedError("ECONNREFUSED"));

    await expect(
      retryWhileDatabaseUnreachable(step, { attempts: 3, delayMs: 0 }),
    ).rejects.toThrow("ECONNREFUSED");
    expect(step).toHaveBeenCalledTimes(3);
  });
});

describe("isDatabaseUnreachable", () => {
  it("recognises the pool connection timeout", () => {
    expect(isDatabaseUnreachable(new Error("Connection terminated due to connection timeout"))).toBe(true);
  });

  it("recognises the connection drops of a postgres that is still initialising", () => {
    expect(isDatabaseUnreachable(codedError("ECONNRESET"))).toBe(true);
    expect(isDatabaseUnreachable(new Error("Connection terminated unexpectedly"))).toBe(true);
  });

  it("does not treat query errors as unreachable", () => {
    expect(isDatabaseUnreachable(codedError("42P01"))).toBe(false);
  });
});
