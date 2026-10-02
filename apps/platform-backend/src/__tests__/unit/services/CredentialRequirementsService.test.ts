import type { Clanker, SecretBinding } from "@viberglass/types";
import { CredentialRequirementsService } from "../../../services/CredentialRequirementsService";

function createClanker(overrides: Partial<Clanker> = {}): Clanker {
  return {
    id: "clanker-1",
    name: "Test Clanker",
    slug: "test-clanker",
    description: null,
    deploymentStrategyId: "strategy-1",
    deploymentStrategy: null,
    deploymentConfig: null,
    configFiles: [],
    agent: "claude-code",
    secretBindings: [],
    status: "active",
    statusMessage: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function codexClanker(mode: string, secretName = "CODEX_AUTH_JSON"): Clanker {
  return createClanker({
    agent: "codex",
    deploymentConfig: {
      version: 1,
      strategy: { type: "docker" },
      agent: { type: "codex", codexAuth: { mode, secretName } },
    },
  });
}

describe("CredentialRequirementsService", () => {
  const getCredentialRequests = jest.fn();
  const workerBindings = jest.fn((_clanker: Clanker): SecretBinding[] => []);
  const service = new CredentialRequirementsService({ getCredentialRequests }, { workerBindings });

  beforeEach(() => {
    getCredentialRequests.mockReset();
    getCredentialRequests.mockResolvedValue([]);
    delete process.env.SECRETS_SSM_PREFIX;
  });

  it("asks for each of the runner's bindings", async () => {
    const bindings = [
      { envVar: "ANTHROPIC_API_KEY", secretId: "secret-a" },
      { envVar: "OPENAI_API_KEY", secretId: "secret-b" },
    ];
    getCredentialRequests.mockResolvedValue([
      { envVar: "ANTHROPIC_API_KEY", ssmPath: "/viberator/secrets/secret-a" },
      { envVar: "OPENAI_API_KEY", ssmPath: null },
    ]);

    const required = await service.getRequiredCredentialsForClanker(createClanker({ secretBindings: bindings }));

    expect(getCredentialRequests).toHaveBeenCalledWith(bindings);
    expect(required).toEqual([
      { envVar: "ANTHROPIC_API_KEY", ssmPath: "/viberator/secrets/secret-a" },
      { envVar: "OPENAI_API_KEY", ssmPath: null },
    ]);
  });

  it("adds the shared codex login cache in device auth modes", async () => {
    for (const mode of ["chatgpt_device", "chatgpt_device_stored"]) {
      await expect(service.getRequiredCredentialsForClanker(codexClanker(mode))).resolves.toEqual([
        { envVar: "CODEX_AUTH_JSON", ssmPath: "/viberator/secrets/CODEX_AUTH_JSON" },
      ]);
    }
  });

  it("keeps an attached CODEX_AUTH_JSON binding instead of adding the shared cache", async () => {
    getCredentialRequests.mockResolvedValue([{ envVar: "CODEX_AUTH_JSON", ssmPath: null }]);

    await expect(service.getRequiredCredentialsForClanker(codexClanker("chatgpt_device"))).resolves.toEqual([
      { envVar: "CODEX_AUTH_JSON", ssmPath: null },
    ]);
  });

  it("asks for a connected runner's own login, for the worker only", async () => {
    workerBindings.mockReturnValueOnce([{ envVar: "CODEX_AUTH_JSON", secretId: "login-1" }]);
    getCredentialRequests.mockImplementation(async (bindings: SecretBinding[]) =>
      bindings.map((binding) => ({ envVar: binding.envVar, ssmPath: null, exposeToAgent: true })),
    );

    await expect(service.getRequiredCredentialsForClanker(codexClanker("chatgpt_device_stored"))).resolves.toEqual([{ envVar: "CODEX_AUTH_JSON", ssmPath: null, exposeToAgent: false }]);
  });

  it("does not add the codex login cache for API key auth", async () => {
    await expect(service.getRequiredCredentialsForClanker(codexClanker("api_key"))).resolves.toEqual([]);
  });

  it("uses the default codex auth secret name even when config provides a custom name", async () => {
    const required = await service.getRequiredCredentialsForClanker(codexClanker("chatgpt_device", "CUSTOM_CODEX_SECRET"));
    expect(required.map((request) => request.envVar)).toEqual(["CODEX_AUTH_JSON"]);
  });
});
