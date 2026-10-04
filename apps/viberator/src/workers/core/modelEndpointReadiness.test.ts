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
  return { deps, progress: jest.fn(async () => {}) };
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
    ["model-waking", "Waking qwen on EU endpoint…"],
    ["model-ready", "qwen is ready"],
  ]);
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
  ).rejects.toThrow("Timed out waiting");
  expect(deps.wait).toHaveBeenCalledTimes(180);
});
