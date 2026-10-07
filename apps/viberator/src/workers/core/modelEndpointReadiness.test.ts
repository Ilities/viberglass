import type { WorkerModelEndpoint } from "@viberglass/types";
import { waitForModelEndpoint } from "./modelEndpointReadiness";

const endpoint: WorkerModelEndpoint = {
  name: "EU endpoint",
  baseUrl: "https://models.example.com/v1",
  model: "qwen",
  apiFormat: "openai-chat",
  auth: { scheme: "bearer" },
  extraHeaders: { "X-Team": "eu" },
  mayColdStart: true,
};
function fixture() {
  let time = 0;
  const deps = {
    fetch: jest.fn(async () => ({ status: 200 })),
    now: () => time,
    wait: jest.fn(async (ms: number) => {
      time += ms;
    }),
    key: "secret",
  };
  return { deps, progress: jest.fn(async (_step: string, _message: string) => {}) };
}

test("waits for an idle model before reporting readiness", async () => {
  const { deps, progress } = fixture();
  deps.fetch
    .mockResolvedValueOnce({ status: 503 })
    .mockRejectedValueOnce(new Error("starting"));
  await waitForModelEndpoint(
    { deploymentConfig: { resolvedModelEndpoint: endpoint } },
    progress,
    deps,
  );
  expect(deps.fetch).toHaveBeenCalledTimes(3);
  expect(deps.fetch).toHaveBeenCalledWith(
    `${endpoint.baseUrl}/models`,
    expect.objectContaining({
      headers: { "X-Team": "eu", Authorization: "Bearer secret" },
      redirect: "error",
    }),
  );
  expect(progress.mock.calls).toEqual([
    ["model-waking", "Waking qwen on EU endpoint. A cold start can take several minutes; this run waits up to 15."],
    ["model-ready", "qwen is ready"],
  ]);
});

test("reports every minute while it waits, so the run isn't given up as lost", async () => {
  const { deps, progress } = fixture();
  // Ready on the first check after ten minutes.
  deps.fetch.mockImplementation(async () => ({ status: deps.now() >= 10 * 60_000 ? 200 : 503 }));
  await waitForModelEndpoint({ resolvedModelEndpoint: endpoint }, progress, deps);

  const stillWaking = progress.mock.calls.filter(([, message]) => String(message).startsWith("Still waking"));
  expect(stillWaking.map(([, message]) => message)).toEqual(
    Array.from({ length: 10 }, (_, index) => `Still waking qwen on EU endpoint: ${index + 1} min so far, waiting up to 15.`),
  );
  expect(progress).toHaveBeenLastCalledWith("model-ready", "qwen is ready");
});

test("ordinary endpoints do not wait or make a request", async () => {
  const { deps, progress } = fixture();
  await waitForModelEndpoint(
    { resolvedModelEndpoint: { ...endpoint, mayColdStart: false } },
    progress,
    deps,
  );
  expect(deps.fetch).not.toHaveBeenCalled();
});

test("fails immediately on authentication errors and times out after fifteen minutes", async () => {
  const { deps, progress } = fixture();
  deps.fetch.mockResolvedValue({ status: 401 });
  await expect(
    waitForModelEndpoint({ resolvedModelEndpoint: endpoint }, progress, deps),
  ).rejects.toThrow("rejected its credentials");
  expect(deps.wait).not.toHaveBeenCalled();
  deps.fetch.mockResolvedValue({ status: 503 });
  await expect(
    waitForModelEndpoint({ resolvedModelEndpoint: endpoint }, progress, deps),
  ).rejects.toThrow("qwen on EU endpoint didn't wake up within 15 minutes.");
  expect(deps.wait).toHaveBeenCalledTimes(180);
});
