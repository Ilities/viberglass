import { ModelEndpointInputValidator } from "../../../../services/modelEndpoints/ModelEndpointInputValidator";
import type { ModelEndpoint, ModelEndpointInput } from "@viberglass/types";
import { ModelEndpointService } from "../../../../services/modelEndpoints/ModelEndpointService";
import { ModelEndpointChecker } from "../../../../services/modelEndpoints/ModelEndpointChecker";
import { RunnerModelEndpointResolver } from "../../../../services/modelEndpoints/RunnerModelEndpointResolver";
import { modelEndpointSchema } from "../../../../api/middleware/modelEndpointSchema";

const input: ModelEndpointInput = {
  name: "EU models",
  baseUrl: "https://models.example.com/v1",
  apiFormat: "openai-chat",
  auth: { scheme: "bearer" },
  secretId: "key-1",
  extraHeaders: { "X-Team": "eu" },
  models: ["qwen"],
  mayColdStart: false,
};
const endpoint: ModelEndpoint = {
  ...input,
  id: "endpoint-1",
  source: "manual",
  deploymentId: null,
  createdAt: "",
  updatedAt: "",
};

function fixture() {
  const dao = {
    list: jest.fn(async (): Promise<ModelEndpoint[]> => []),
    get: jest.fn(async (): Promise<ModelEndpoint | null> => endpoint),
    create: jest.fn(async () => endpoint),
    update: jest.fn(async () => endpoint),
    delete: jest.fn(async () => {}),
    runnersUsing: jest.fn(
      async (): Promise<
        Array<{ name: string; agent: string | null; model: string }>
      > => [],
    ),
  };
  const secret = {
    id: "key-1",
    name: "Key",
    secretLocation: "database" as const,
    secretPath: null,
    secretValueEncrypted: "encrypted",
    sourceEnvVar: null,
    provider: null,
    purpose: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const secrets = { getSecret: jest.fn(async () => secret) };
  const service = new ModelEndpointService(dao, new ModelEndpointInputValidator(secrets));
  return { dao, secrets, service };
}

describe("workspace model endpoints", () => {
  test("validates shared auth and rejects credentials in URLs or extra headers", async () => {
    const { service, dao } = fixture();
    await service.create(input);
    expect(dao.create).toHaveBeenCalledWith(input);
    for (const invalid of [
      { ...input, secretId: null },
      { ...input, baseUrl: "https://key:secret@host/v1" },
      { ...input, extraHeaders: { authorization: "secret" } },
      { ...input, extraHeaders: { "X-Team": "a", "x-team": "b" } },
      { ...input, auth: { scheme: "none" as const } },
    ])
      await expect(service.create(invalid)).rejects.toMatchObject({
        statusCode: 400,
      });
    expect(dao.create).toHaveBeenCalledTimes(1);
  });

  test("allows an anonymous endpoint without a key", async () => {
    await expect(
      fixture().service.create({
        ...input,
        auth: { scheme: "none" },
        secretId: null,
      }),
    ).resolves.toEqual(endpoint);
  });

  test("rejects unsupported harnesses, unknown models and missing endpoints", async () => {
    const { service, dao } = fixture();
    await service.validateSelection(
      { endpointId: endpoint.id, model: "qwen" },
      "pi",
    );
    await service.validateSelection(
      { endpointId: endpoint.id, model: "qwen" },
      "opencode",
    );
    await expect(
      service.validateSelection(
        { endpointId: endpoint.id, model: "qwen" },
        "codex",
      ),
    ).rejects.toMatchObject({ code: "MODEL_ENDPOINT_UNSUPPORTED" });
    await expect(
      service.validateSelection(
        { endpointId: endpoint.id, model: "missing" },
        "pi",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    dao.get.mockResolvedValue(null);
    await expect(
      service.validateSelection(
        { endpointId: endpoint.id, model: "qwen" },
        "pi",
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test("protects deployment ownership and in-use endpoints", async () => {
    const { service, dao } = fixture();
    dao.get.mockResolvedValue({
      ...endpoint,
      source: "deployment",
      deploymentId: "deployment-1",
    });
    await expect(service.update(endpoint.id, input)).rejects.toMatchObject({
      code: "MODEL_ENDPOINT_READ_ONLY",
    });
    await expect(service.delete(endpoint.id)).rejects.toMatchObject({
      code: "MODEL_ENDPOINT_READ_ONLY",
    });
    dao.get.mockResolvedValue(endpoint);
    dao.runnersUsing.mockResolvedValue([
      { name: "Runner", agent: "opencode", model: "qwen" },
    ]);
    await expect(service.delete(endpoint.id)).rejects.toMatchObject({
      code: "MODEL_ENDPOINT_IN_USE",
    });
    await expect(
      service.update(endpoint.id, { ...input, models: ["other"] }),
    ).rejects.toMatchObject({ code: "MODEL_ENDPOINT_IN_USE" });
    await expect(
      service.update(endpoint.id, {
        ...input,
        apiFormat: "anthropic-messages",
      }),
    ).rejects.toMatchObject({ code: "MODEL_ENDPOINT_IN_USE" });
    expect(dao.delete).not.toHaveBeenCalled();
    expect(dao.update).not.toHaveBeenCalled();
  });

  test("resolves a runner's endpoint into metadata and a credential reference", async () => {
    const resolver = new RunnerModelEndpointResolver(fixture().service);
    const result = await resolver.resolve({
      agent: "opencode",
      modelEndpoint: { endpointId: endpoint.id, model: "qwen" },
    });
    expect(result.endpoint).toMatchObject({
      baseUrl: input.baseUrl,
      model: "qwen",
      auth: input.auth,
    });
    expect(result.endpoint).not.toHaveProperty("secretId");
    expect(result.secretBindings).toEqual([
      { envVar: "MODEL_ENDPOINT_API_KEY", secretId: "key-1" },
    ]);
    expect(await resolver.resolve({ agent: "opencode" })).toEqual({
      secretBindings: [],
    });
  });

  test("checks headers, discovers model IDs and refuses redirects", async () => {
    const fetchFn = jest.fn(async () => ({
      status: 200,
      json: async () => ({
        data: [{ id: "qwen" }, { id: "qwen" }, {}, { id: 123 }],
      }),
    }));
    const secrets = {
      resolveSecretValues: jest.fn(
        async () => new Map([["key-1", "raw-secret"]]),
      ),
    };
    const checker = new ModelEndpointChecker(secrets, fetchFn);
    expect(
      await checker.check({
        ...input,
        auth: { scheme: "header", header: "x-model-key" },
      }),
    ).toEqual({ models: ["qwen"], discoverySupported: true });
    expect(fetchFn).toHaveBeenCalledWith(
      `${input.baseUrl}/models`,
      expect.objectContaining({
        method: "GET",
        redirect: "error",
        headers: { "X-Team": "eu", "x-model-key": "raw-secret" },
      }),
    );
  });

  test("supports manual IDs when discovery is unavailable and rejects auth failures", async () => {
    const fetchFn = jest.fn(async () => ({
      status: 404,
      json: async () => ({}),
    }));
    const checker = new ModelEndpointChecker(
      { resolveSecretValues: async () => new Map() },
      fetchFn,
    );
    const anonymous: ModelEndpointInput = {
      ...input,
      auth: { scheme: "none" },
      secretId: null,
    };
    expect(await checker.check(anonymous)).toEqual({
      models: ["qwen"],
      discoverySupported: false,
    });
    fetchFn.mockResolvedValue({ status: 401, json: async () => ({}) });
    await expect(checker.check(anonymous)).rejects.toMatchObject({
      code: "MODEL_ENDPOINT_REJECTED",
    });
    fetchFn.mockRejectedValue(new Error("secret detail"));
    await expect(checker.check(anonymous)).rejects.toMatchObject({
      code: "MODEL_ENDPOINT_UNREACHABLE",
    });
  });

  test("the API rejects malformed auth and newline headers", () => {
    expect(
      modelEndpointSchema.validate({
        ...input,
        secretId: null,
        auth: { scheme: "header", header: "bad\nheader" },
      }).error,
    ).toBeDefined();
    expect(
      modelEndpointSchema.validate({
        ...input,
        secretId: null,
        extraHeaders: { "X-Test": "bad\nvalue" },
      }).error,
    ).toBeDefined();
  });
});
