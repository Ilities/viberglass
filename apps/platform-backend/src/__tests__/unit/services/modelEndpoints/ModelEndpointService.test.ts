import { ModelEndpointInputValidator } from "../../../../services/modelEndpoints/ModelEndpointInputValidator";
import type { ModelApiFormat, ModelEndpoint, ModelEndpointInput } from "@viberglass/types";
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
  contextWindows: {},
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
  test("lists endpoints with the runners that use them", async () => {
    const { service, dao } = fixture();
    dao.list.mockResolvedValue([endpoint]);
    dao.runnersUsing.mockResolvedValue([{ name: "Docs bot", agent: "opencode", model: "qwen" }]);
    await expect(service.list()).resolves.toEqual([{ ...endpoint, runners: ["Docs bot"] }]);
  });

  test("validates shared auth and rejects credentials in URLs or extra headers", async () => {
    const { service, dao } = fixture();
    await service.create(input);
    expect(dao.create).toHaveBeenCalledWith({ ...input, contextWindows: {} });
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
        apiFormat: "openai-responses",
      }),
    ).rejects.toMatchObject({ code: "MODEL_ENDPOINT_IN_USE" });
    expect(dao.delete).not.toHaveBeenCalled();
    expect(dao.update).not.toHaveBeenCalled();
  });

  test.each<ModelApiFormat>(["openai-chat", "anthropic-messages"])("resolves a runner's %s endpoint into metadata and a credential reference", async (apiFormat) => {
    const { service, dao } = fixture();
    dao.get.mockResolvedValue({ ...endpoint, apiFormat });
    const resolver = new RunnerModelEndpointResolver(service);
    const result = await resolver.resolve({
      agent: "opencode",
      modelEndpoint: { endpointId: endpoint.id, model: "qwen" },
    });
    expect(result.endpoint).toMatchObject({
      apiFormat,
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

  test("gives a runner the model's known context length, a local endpoint's model the local default, and a remote one's none", async () => {
    const resolveWith = async (stored: Partial<ModelEndpoint>) => {
      const { dao, service } = fixture();
      dao.get.mockResolvedValue({ ...endpoint, ...stored });
      const result = await new RunnerModelEndpointResolver(service).resolve({
        agent: "opencode",
        modelEndpoint: { endpointId: endpoint.id, model: "qwen" },
      });
      return result.endpoint?.contextWindow;
    };
    expect(await resolveWith({ contextWindows: { qwen: 131072 } })).toBe(131072);
    expect(await resolveWith({ baseUrl: "http://localhost:11434/v1" })).toBe(32768);
    expect(await resolveWith({ baseUrl: "http://host.docker.internal:8000/v1", contextWindows: { qwen: 65536 } })).toBe(65536);
    expect(await resolveWith({})).toBeUndefined();
  });

  test("reads each listed model's context length where the server reports one", async () => {
    const fetchFn = jest.fn(async () => ({
      status: 200,
      json: async () => ({
        data: [
          { id: "vllm-model", max_model_len: 32768 },
          { id: "router-model", context_length: 200000 },
          { id: "groq-model", context_window: 131072 },
          { id: "studio-model", max_context_length: 8192 },
          { id: "plain-model" },
          { id: "odd-model", max_model_len: "big" },
        ],
      }),
    }));
    const checker = new ModelEndpointChecker({ resolveSecretValues: jest.fn(async () => new Map([["key-1", "raw-secret"]])) }, fetchFn);
    const result = await checker.check({ ...input, contextWindows: { "plain-model": 4096, "vllm-model": 1 } });
    expect(result.contextWindows).toEqual({
      "vllm-model": 32768,
      "router-model": 200000,
      "groq-model": 131072,
      "studio-model": 8192,
      "plain-model": 4096,
    });
  });

  test("keeps a context length only for a model the endpoint lists", async () => {
    const { dao, service } = fixture();
    await service.create({ ...input, models: ["qwen"], contextWindows: { qwen: 32768, gone: 4096 } });
    expect(dao.create).toHaveBeenCalledWith(expect.objectContaining({ contextWindows: { qwen: 32768 } }));
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
    ).toEqual({ models: ["qwen"], contextWindows: {}, discoverySupported: true });
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
      contextWindows: {},
      discoverySupported: false,
      detail: `Nothing lists models at ${input.baseUrl}/models (HTTP 404).`,
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

  test("lists an Anthropic-format endpoint's models under /v1, as Anthropic clients do", async () => {
    const fetchFn = jest.fn(async () => ({
      status: 200,
      json: async () => ({ data: [{ id: "glm-5" }] }),
    }));
    const checker = new ModelEndpointChecker(
      { resolveSecretValues: async () => new Map([["key-1", "raw-secret"]]) },
      fetchFn,
    );
    await checker.check({
      ...input,
      baseUrl: "https://api.example.com/anthropic/",
      apiFormat: "anthropic-messages",
      auth: { scheme: "header", header: "x-api-key" },
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.example.com/anthropic/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({ "anthropic-version": "2023-06-01", "x-api-key": "raw-secret" }),
      }),
    );
  });

  test("drops /v1 from an Anthropic-format base URL, since Anthropic clients add it", async () => {
    const { service, dao } = fixture();
    await service.create({
      ...input,
      baseUrl: "https://opencode.ai/zen/go/v1/",
      apiFormat: "anthropic-messages",
    });
    expect(dao.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://opencode.ai/zen/go" }),
    );
  });

  test("says where it looked when an endpoint lists no models", async () => {
    const checker = new ModelEndpointChecker(
      { resolveSecretValues: async () => new Map([["key-1", "raw-secret"]]) },
      jest.fn(async () => ({ status: 404, json: async () => ({}) })),
    );
    await expect(checker.check(input)).resolves.toMatchObject({
      discoverySupported: false,
      detail: "Nothing lists models at https://models.example.com/v1/models (HTTP 404).",
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
