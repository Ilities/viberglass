import type { Clanker } from "@viberglass/types";
import { CodexLoginService } from "../../../../services/codexLogin/CodexLoginService";

jest.mock("../../../../persistence/clanker/ClankerDAO", () => ({ ClankerDAO: jest.fn() }));
jest.mock("../../../../services/SecretService", () => ({
  ...jest.requireActual("../../../../services/SecretService"),
  SecretService: jest.fn(),
}));

function codexRunner(codexAuth: Record<string, unknown>): Clanker {
  return {
    id: "runner-1",
    name: "Codex runner",
    slug: "codex-runner",
    description: null,
    deploymentStrategyId: "docker",
    deploymentStrategy: null,
    deploymentConfig: {
      version: 1,
      strategy: { type: "docker" },
      agent: { type: "codex", codexAuth: { secretName: "CODEX_AUTH_JSON", ...codexAuth } },
    },
    configFiles: [],
    agent: "codex",
    secretBindings: [],
    status: "active",
    statusMessage: null,
    createdAt: "",
    updatedAt: "",
  };
}

function build(runner: Clanker, location: "database" | "ssm" = "database") {
  const getClanker = jest.fn(async () => runner);
  const updateClanker = jest.fn(async () => runner);
  const getSecret = jest.fn(async (id: string) => (id === "login-1" ? { id, secretLocation: location } : null));
  const createSecret = jest.fn(async () => ({ id: "login-new", secretLocation: location }));
  const updateSecret = jest.fn(async (id: string) => ({ id, secretLocation: location }));
  const service = new CodexLoginService(
    { getClanker, updateClanker },
    { getSecret, createSecret, updateSecret },
    location,
  );
  return { service, updateClanker, createSecret, updateSecret };
}

describe("CodexLoginService", () => {
  it("gives the worker the runner's login, never the agent", () => {
    const { service } = build(codexRunner({ mode: "chatgpt_device_stored", loginSecretId: "login-1" }));
    expect(service.workerBindings(codexRunner({ mode: "chatgpt_device_stored", loginSecretId: "login-1" }))).toEqual([
      { envVar: "CODEX_AUTH_JSON", secretId: "login-1" },
    ]);
    expect(service.workerBindings(codexRunner({ mode: "api_key", loginSecretId: "login-1" }))).toEqual([]);
  });

  it("creates the runner's login secret on first upload and links it", async () => {
    const runner = codexRunner({ mode: "chatgpt_device_stored" });
    const { service, createSecret, updateClanker } = build(runner);

    await service.saveLogin("runner-1", '{"tokens":{}}');

    expect(createSecret).toHaveBeenCalledWith({
      name: "ChatGPT login · Codex runner",
      purpose: "codex_login",
      secretLocation: "database",
      secretValue: '{"tokens":{}}',
    });
    expect(updateClanker).toHaveBeenCalledWith("runner-1", {
      deploymentConfig: expect.objectContaining({
        agent: expect.objectContaining({ codexAuth: expect.objectContaining({ loginSecretId: "login-new" }) }),
      }),
    });
  });

  it("replaces the value of a linked login", async () => {
    const { service, createSecret, updateSecret } = build(
      codexRunner({ mode: "chatgpt_device_stored", loginSecretId: "login-1" }),
    );

    await service.saveLogin("runner-1", '{"tokens":{"refresh":"r2"}}');

    expect(createSecret).not.toHaveBeenCalled();
    expect(updateSecret).toHaveBeenCalledWith("login-1", { secretValue: '{"tokens":{"refresh":"r2"}}' });
  });
});
