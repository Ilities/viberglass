import { IntegrationCredentialTokenSource } from "../../../webhooks/feedback/IntegrationCredentialTokenSource";

jest.mock("../../../persistence/integrations/IntegrationCredentialDAO", () => ({
  IntegrationCredentialDAO: jest.fn(),
}));
jest.mock("../../../services/SecretResolutionService", () => ({
  SecretResolutionService: jest.fn(),
}));

function source(credential: object | null, values: Record<string, string>) {
  const credentials = { getDefaultForIntegration: jest.fn().mockResolvedValue(credential) };
  const secrets = { resolveSecretsForClanker: jest.fn().mockResolvedValue(values) };
  return { tokens: new IntegrationCredentialTokenSource(credentials, secrets), secrets };
}

describe("IntegrationCredentialTokenSource", () => {
  it("returns the value of the connection's default token credential", async () => {
    const { tokens, secrets } = source({ credentialType: "token", secretId: "secret-1" }, { GITHUB_TOKEN: "ghp_real" });

    await expect(tokens.resolveDefaultToken("integration-1")).resolves.toBe("ghp_real");
    expect(secrets.resolveSecretsForClanker).toHaveBeenCalledWith(["secret-1"]);
  });

  it("has nothing for a connection without a default credential, or one that isn't a token", async () => {
    await expect(source(null, {}).tokens.resolveDefaultToken("integration-1")).resolves.toBeNull();
    const sshKey = source({ credentialType: "ssh_key", secretId: "secret-1" }, { KEY: "---" });
    await expect(sshKey.tokens.resolveDefaultToken("integration-1")).resolves.toBeNull();
  });

  it("has nothing when the credential's secret has no value", async () => {
    const empty = source({ credentialType: "token", secretId: "secret-1" }, {});
    await expect(empty.tokens.resolveDefaultToken("integration-1")).resolves.toBeNull();
  });
});
