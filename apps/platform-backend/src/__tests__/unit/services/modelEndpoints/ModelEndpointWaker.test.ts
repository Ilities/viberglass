import type { ModelEndpoint } from "@viberglass/types";
import { ModelEndpointWaker } from "../../../../services/modelEndpoints/ModelEndpointWaker";
import type { ModelDeploymentRecord } from "../../../../persistence/modelHosting/ModelDeploymentDAO";

const endpoint: ModelEndpoint = {
  id: "endpoint-1",
  name: "Qwen",
  baseUrl: "https://containers.verda.com/qwen/v1",
  apiFormat: "openai-chat",
  auth: { scheme: "bearer" },
  secretId: "key-1",
  extraHeaders: {},
  models: ["Qwen/Qwen3-8B"],
  mayColdStart: true,
  source: "deployment",
  deploymentId: "deployment-1",
  createdAt: "",
  updatedAt: "",
};

function deployment(mode: ModelDeploymentRecord["mode"]): ModelDeploymentRecord {
  return {
    id: "deployment-1",
    name: "Qwen",
    accountId: "account-1",
    host: "verda",
    externalId: "qwen",
    model: "Qwen/Qwen3-8B",
    flavour: { id: "L40S", gpuCount: 1 },
    servingArgs: [],
    mode,
    endpointId: endpoint.id,
    createdAt: "",
    updatedAt: "",
  };
}

function fixture(mode: ModelDeploymentRecord["mode"] = "scale-to-zero") {
  const fetchFn = jest.fn(async (_url: string, _init: RequestInit) => ({ status: 200 }));
  const waker = new ModelEndpointWaker(
    { getByEndpoint: jest.fn(async () => deployment(mode)) },
    { resolveSecretValues: jest.fn(async () => new Map([["key-1", "inference"]])) },
    fetchFn,
  );
  return { fetchFn, waker };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("readying a run's model endpoint", () => {
  test("sends one authenticated request to wake an endpoint that may be scaled to zero", async () => {
    const { waker, fetchFn } = fixture();
    await waker.prepare(endpoint);
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://containers.verda.com/qwen/v1/models");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer inference");
  });

  test("fails a run on a stopped deployment without waking it", async () => {
    const { waker, fetchFn } = fixture("stopped");
    await expect(waker.prepare(endpoint)).rejects.toThrow(
      "Qwen is stopped. Start it or pick another endpoint.",
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("doesn't wait for the wake request or fail when it errors", async () => {
    const { waker, fetchFn } = fixture();
    fetchFn.mockRejectedValueOnce(new Error("timeout"));
    await expect(waker.prepare(endpoint)).resolves.toBeUndefined();
    await flush();
  });

  test("leaves endpoints that are always on alone", async () => {
    const { waker, fetchFn } = fixture();
    await waker.prepare({ ...endpoint, source: "manual", deploymentId: null, mayColdStart: false });
    await flush();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
