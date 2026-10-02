import { SCM_TOKEN_ENV_VAR } from "@viberglass/types";
import { SecretResolutionService } from "../../../services/SecretResolutionService";

jest.mock("../../../services/SecretService", () => ({ SecretService: jest.fn() }));
jest.mock("../../../persistence/secret/SecretDAO", () => ({ SecretDAO: jest.fn() }));

function secret(id: string, secretLocation: "ssm" | "database", secretPath: string | null = null) {
  return {
    id,
    name: `Label ${id}`,
    secretLocation,
    secretPath,
    secretValueEncrypted: null,
    sourceEnvVar: null,
    provider: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("SecretResolutionService", () => {
  const resolveSecretValues = jest.fn();
  const getSecretsByIds = jest.fn();
  const service = new SecretResolutionService({ resolveSecretValues }, { getSecretsByIds });

  beforeEach(() => jest.resetAllMocks());

  it("exposes each value under its binding's env var, two keys from one provider included", async () => {
    resolveSecretValues.mockImplementation(async ([id]: string[]) => new Map([[id, `value-${id}`]]));

    await expect(
      service.resolveBindings([
        { envVar: "ANTHROPIC_API_KEY", secretId: "team" },
        { envVar: "ANTHROPIC_AUTH_TOKEN", secretId: "personal" },
      ]),
    ).resolves.toEqual({ ANTHROPIC_API_KEY: "value-team", ANTHROPIC_AUTH_TOKEN: "value-personal" });
  });

  it("leaves out a secret that can't be read instead of failing the others", async () => {
    resolveSecretValues.mockImplementation(async ([id]: string[]) => {
      if (id === "broken") throw new Error("SSM down");
      return new Map([[id, "ok"]]);
    });

    await expect(
      service.resolveBindings([
        { envVar: "BROKEN", secretId: "broken" },
        { envVar: "WORKS", secretId: "works" },
      ]),
    ).resolves.toEqual({ WORKS: "ok" });
  });

  it("sends SSM paths only for SSM secrets and drops bindings to deleted ones", async () => {
    getSecretsByIds.mockResolvedValue([secret("a", "ssm", "/viberator/secrets/a"), secret("b", "database")]);

    await expect(
      service.getCredentialRequests([
        { envVar: "A", secretId: "a" },
        { envVar: "B", secretId: "b" },
        { envVar: "GONE", secretId: "gone" },
      ]),
    ).resolves.toEqual([
      { envVar: "A", ssmPath: "/viberator/secrets/a", exposeToAgent: true },
      { envVar: "B", ssmPath: null, exposeToAgent: true },
    ]);
  });

  it("keeps the repository token from the agent", async () => {
    getSecretsByIds.mockResolvedValue([secret("repo", "database")]);

    await expect(service.getCredentialRequests([{ envVar: SCM_TOKEN_ENV_VAR, secretId: "repo" }])).resolves.toEqual([
      { envVar: SCM_TOKEN_ENV_VAR, ssmPath: null, exposeToAgent: false },
    ]);
  });
});
