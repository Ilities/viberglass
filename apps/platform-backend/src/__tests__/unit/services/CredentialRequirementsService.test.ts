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
    mcpServerIds: [],
    skillIds: [],
    status: "active",
    statusMessage: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function codexClanker(signIn?: Record<string, unknown>, secretBindings: SecretBinding[] = []): Clanker {
  return createClanker({
    agent: "codex",
    secretBindings,
    deploymentConfig: {
      version: 1,
      strategy: { type: "docker" },
      agent: { type: "codex", ...(signIn ? { signIn } : {}) },
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

  it("asks for a connected runner's own login, for the worker only", async () => {
    workerBindings.mockReturnValueOnce([{ envVar: "CODEX_AUTH_JSON", secretId: "login-1" }]);
    getCredentialRequests.mockImplementation(async (bindings: SecretBinding[]) =>
      bindings.map((binding) => ({ envVar: binding.envVar, ssmPath: null, exposeToAgent: true })),
    );

    await expect(service.getRequiredCredentialsForClanker(codexClanker({ method: "chatgpt", loginSecretId: "login-1" }))).resolves.toEqual([
      { envVar: "CODEX_AUTH_JSON", ssmPath: null, exposeToAgent: false },
    ]);
  });

  it("asks for no login before the runner has signed in, and drops a binding under the login's variable", async () => {
    getCredentialRequests.mockImplementation(async (bindings: SecretBinding[]) =>
      bindings.map((binding) => ({ envVar: binding.envVar, ssmPath: null })),
    );

    await expect(
      service.getRequiredCredentialsForClanker(codexClanker({ method: "chatgpt" }, [{ envVar: "CODEX_AUTH_JSON", secretId: "other" }])),
    ).resolves.toEqual([]);
  });

  it("leaves a runner that signs in with an API key alone", async () => {
    await expect(service.getRequiredCredentialsForClanker(codexClanker())).resolves.toEqual([]);
  });
});
