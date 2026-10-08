import { startWorkerHeartbeat } from "./workerHeartbeat";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it("keeps a silent agent reporting for longer than thirty minutes and stops on cleanup", async () => {
  const send = jest.fn().mockResolvedValue(undefined);
  const stop = startWorkerHeartbeat(send, { warn: jest.fn() });
  await jest.advanceTimersByTimeAsync(45 * 60_000);
  expect(send).toHaveBeenCalledTimes(45);
  stop();
  await jest.advanceTimersByTimeAsync(5 * 60_000);
  expect(send).toHaveBeenCalledTimes(45);
});

it("does not overlap slow deliveries and retries after a failure", async () => {
  const warn = jest.fn();
  const send = jest.fn<Promise<void>, []>()
    .mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 150_000)))
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValue(undefined);
  const stop = startWorkerHeartbeat(send, { warn });
  await jest.advanceTimersByTimeAsync(180_000);
  expect(send).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(120_000);
  expect(send).toHaveBeenCalledTimes(3);
  expect(warn).toHaveBeenCalledTimes(1);
  stop();
});
