import { ConnectionCredentialsResolver } from "../../../../services/trackers/ConnectionCredentialsResolver";

function resolver(options: { credential?: { credentialType: string; secretId: string } | null; named?: string | null }) {
  return new ConnectionCredentialsResolver(
    { getDefaultForIntegration: jest.fn().mockResolvedValue(options.credential ?? null) },
    { resolveSecretValue: jest.fn().mockResolvedValue("default-token") },
    { resolveSecretValueByName: jest.fn().mockResolvedValue(options.named ?? null) },
  );
}

describe("ConnectionCredentialsResolver", () => {
  it("fills in the connection's default token", async () => {
    const credentials = await resolver({ credential: { credentialType: "token", secretId: "s-1" } }).resolve({
      id: "conn-1",
      config: { instanceUrl: "https://acme.atlassian.net", email: "bot@acme.com" },
    });
    expect(credentials).toEqual({ type: "token", instanceUrl: "https://acme.atlassian.net", email: "bot@acme.com", token: "default-token" });
  });

  it("falls back to the secret the settings name, and keeps a known auth type", async () => {
    const credentials = await resolver({ named: "named-token" }).resolve({ id: "conn-1", config: { authType: "basic", secretName: "JIRA_TOKEN" } });
    expect(credentials).toMatchObject({ type: "basic", token: "named-token" });
  });
});
