import type {
  ModelDeploymentMode,
  ModelDeploymentStatus,
  ModelEndpoint,
  ModelHostCredentials,
  ModelHostDeploymentSpec,
  ModelHostFlavour,
} from "@viberglass/types";
import { ModelDeploymentService } from "../../../../services/modelHosting/ModelDeploymentService";
import type { ModelDeploymentRecord } from "../../../../persistence/modelHosting/ModelDeploymentDAO";
import type { ModelHostAccountRecord } from "../../../../persistence/modelHosting/ModelHostAccountDAO";

const account: ModelHostAccountRecord = {
  id: "account-1",
  name: "Verda EU",
  host: "verda",
  clientId: "client",
  hasHuggingFaceToken: false,
  clientSecretId: "secret-client",
  endpointKeySecretId: "secret-key",
  huggingFaceTokenSecretId: null,
  createdAt: "",
  updatedAt: "",
};
const deployment: ModelDeploymentRecord = {
  id: "deployment-1",
  name: "Qwen",
  accountId: account.id,
  host: "verda",
  externalId: "qwen-abc123",
  model: "Qwen/Qwen3-8B",
  flavour: { id: "L40S", gpuCount: 1 },
  servingArgs: [],
  mode: "scale-to-zero",
  endpointId: "endpoint-1",
  wakingSince: null,
  createdAt: "",
  updatedAt: "",
};
const input = {
  name: "Qwen",
  accountId: account.id,
  model: "Qwen/Qwen3-8B",
  flavour: { id: "L40S", gpuCount: 1 },
  servingArgs: ["--tool-call-parser", "hermes"],
};

function fixture() {
  const host = {
    kind: "verda" as const,
    label: "Verda",
    listFlavours: jest.fn<Promise<ModelHostFlavour[]>, [ModelHostCredentials]>(async () => [
      {
        id: "L40S",
        gpuCount: 1,
        gpu: "L40S 48GB",
        vramGb: 48,
        pricePerHour: 1.52,
        currency: "EUR",
        available: true,
        recipeHardware: null,
      },
    ]),
    create: jest.fn<
      Promise<{ externalId: string; baseUrl: string }>,
      [ModelHostCredentials, ModelHostDeploymentSpec]
    >(async () => ({
      externalId: "qwen-abc123",
      baseUrl: "https://containers.verda.com/qwen-abc123/v1",
    })),
    getStatus: jest.fn<Promise<ModelDeploymentStatus>, [ModelHostCredentials, string]>(
      async () => ({ state: "idle" }),
    ),
    setMode: jest.fn<Promise<void>, [ModelHostCredentials, string, ModelDeploymentMode]>(
      async () => {},
    ),
    delete: jest.fn<Promise<void>, [ModelHostCredentials, string]>(async () => {}),
  };
  const deployments = {
    list: jest.fn(async () => [deployment]),
    get: jest.fn(async (): Promise<ModelDeploymentRecord | null> => deployment),
    getByEndpoint: jest.fn(async () => deployment),
    create: jest.fn(async () => deployment),
    setMode: jest.fn(async () => {}),
    setWakingSince: jest.fn(async (_id: string, _since: Date | null) => {}),
    delete: jest.fn(async () => {}),
  };
  const endpoints = {
    list: jest.fn(async (): Promise<ModelEndpoint[]> => []),
    runnersUsing: jest.fn(
      async (): Promise<Array<{ name: string; agent: string | null; model: string }>> => [],
    ),
  };
  const connector = {
    connect: jest.fn(async () => ({
      account,
      host,
      credentials: { clientId: "client", clientSecret: "secret" },
    })),
  };
  let now = new Date("2026-10-07T09:00:00Z");
  return {
    host,
    deployments,
    endpoints,
    connector,
    advance: (minutes: number) => {
      now = new Date(now.getTime() + minutes * 60_000);
    },
    service: new ModelDeploymentService(deployments, endpoints, connector, () => now),
  };
}

describe("model deployments", () => {
  test("creates a scale-to-zero deployment owning a bearer endpoint keyed by the account's inference key", async () => {
    const { service, host, deployments } = fixture();
    await service.create(input);
    expect(host.create).toHaveBeenCalledWith(
      { clientId: "client", clientSecret: "secret" },
      {
        name: "Qwen",
        model: "Qwen/Qwen3-8B",
        flavour: { id: "L40S", gpuCount: 1 },
        servingArgs: ["--tool-call-parser", "hermes"],
        mode: "scale-to-zero",
      },
    );
    expect(deployments.create).toHaveBeenCalledWith(
      { ...input, externalId: "qwen-abc123", mode: "scale-to-zero" },
      {
        name: "Qwen",
        baseUrl: "https://containers.verda.com/qwen-abc123/v1",
        apiFormat: "openai-chat",
        auth: { scheme: "bearer" },
        secretId: "secret-key",
        extraHeaders: {},
        models: ["Qwen/Qwen3-8B"],
        mayColdStart: true,
      },
    );
  });

  test("passes the cloud's refusal on as a bad gateway in its own words", async () => {
    const { service, host, deployments } = fixture();
    host.create.mockRejectedValueOnce(new Error("You must add balance to run deployments"));
    await expect(service.create(input)).rejects.toMatchObject({
      statusCode: 502,
      message: "You must add balance to run deployments",
    });
    expect(deployments.create).not.toHaveBeenCalled();
  });

  test("removes the cloud deployment when it can't be stored", async () => {
    const { service, host, deployments } = fixture();
    deployments.create.mockRejectedValueOnce(new Error("database down"));
    await expect(service.create(input)).rejects.toThrow("database down");
    expect(host.delete).toHaveBeenCalledWith(expect.anything(), "qwen-abc123");
  });

  test("refuses a name an endpoint already has, before creating anything", async () => {
    const { service, host, endpoints } = fixture();
    endpoints.list.mockResolvedValueOnce([
      {
        id: "e",
        name: "Qwen",
        baseUrl: "",
        apiFormat: "openai-chat",
        auth: { scheme: "none" },
        extraHeaders: {},
        models: [],
        mayColdStart: false,
        source: "manual",
        deploymentId: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    await expect(service.create(input)).rejects.toMatchObject({ statusCode: 409 });
    expect(host.create).not.toHaveBeenCalled();
  });

  test("refuses to delete a deployment runners use, and otherwise deletes it in the cloud first", async () => {
    const { service, host, deployments, endpoints } = fixture();
    endpoints.runnersUsing.mockResolvedValueOnce([{ name: "EU runner", agent: "opencode", model: "x" }]);
    await expect(service.delete(deployment.id)).rejects.toThrow("EU runner");
    expect(host.delete).not.toHaveBeenCalled();

    await service.delete(deployment.id);
    expect(host.delete).toHaveBeenCalledWith(expect.anything(), "qwen-abc123");
    expect(deployments.delete).toHaveBeenCalledWith(deployment.id);
  });

  test("switches mode in the cloud before recording it", async () => {
    const { service, host, deployments } = fixture();
    host.setMode.mockRejectedValueOnce(new Error("quota"));
    await expect(service.setMode(deployment.id, "keep-warm")).rejects.toThrow("quota");
    expect(deployments.setMode).not.toHaveBeenCalled();
    await service.setMode(deployment.id, "keep-warm");
    expect(deployments.setMode).toHaveBeenCalledWith(deployment.id, "keep-warm");
  });

  test("lists deployments with cloud state, price and runners, and survives a cloud error", async () => {
    const { service, host, endpoints } = fixture();
    endpoints.runnersUsing.mockResolvedValueOnce([{ name: "EU runner", agent: "opencode", model: "x" }]);
    const [view] = await service.list();
    expect(view).toMatchObject({ status: { state: "idle" }, pricePerHour: 1.52, currency: "EUR", runners: ["EU runner"] });
    expect(view).not.toHaveProperty("externalId");

    host.getStatus.mockRejectedValueOnce(new Error("Verda is down"));
    const [unknown] = await service.list();
    expect(unknown.status).toEqual({ state: "unknown", detail: "Verda is down" });
  });

  test("reports a deployment that has been waking past any run's wait as failed, and forgets it once it's up", async () => {
    const { service, host, deployments, advance } = fixture();
    host.getStatus.mockResolvedValue({ state: "waking" });

    const [first] = await service.list();
    expect(first.status).toEqual({ state: "waking" });
    const since = deployments.setWakingSince.mock.calls[0][1];
    expect(since).toEqual(new Date("2026-10-07T09:00:00Z"));

    deployments.list.mockResolvedValue([{ ...deployment, wakingSince: since }]);
    advance(19);
    expect((await service.list())[0].status).toEqual({ state: "waking" });
    advance(2);
    const [stuck] = await service.list();
    expect(stuck.status).toMatchObject({ state: "failed", detail: expect.stringContaining("Still not answering after 21 minutes") });
    expect(stuck).not.toHaveProperty("wakingSince");

    host.getStatus.mockResolvedValue({ state: "running" });
    await service.list();
    expect(deployments.setWakingSince).toHaveBeenLastCalledWith(deployment.id, null);
  });
});
