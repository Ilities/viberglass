import type { IntegrationCredential, PluginField } from "@viberglass/types";
import { ConnectionSecretFields } from "../../../../../api/services/integrations/ConnectionSecretFields";

const FIELDS: PluginField[] = [
  { key: "siteUrl", label: "Site URL", type: "string" },
  { key: "botToken", label: "Bot token", type: "secret" },
  { key: "signingSecret", label: "Signing secret", type: "secret" },
];

function stored(name: string, secretId: string): IntegrationCredential {
  return {
    id: `cred-${name}`,
    integrationId: "conn-1",
    name,
    credentialType: "secret_field",
    secretId,
    secretLocation: "database",
    isDefault: false,
    createdAt: "",
    updatedAt: "",
  };
}

function setup(existing: IntegrationCredential[] = []) {
  const credentials = {
    listByIntegrationId: jest.fn().mockResolvedValue(existing),
    create: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(true),
  };
  const secrets = {
    createSecret: jest.fn().mockResolvedValue({ id: "secret-new" }),
    updateSecret: jest.fn().mockResolvedValue(undefined),
    deleteSecret: jest.fn().mockResolvedValue(true),
  };
  return { credentials, secrets, fields: new ConnectionSecretFields(credentials, secrets, () => "database") };
}

describe("ConnectionSecretFields", () => {
  it("keeps secret fields out of the config and takes only the values entered", () => {
    const { fields } = setup();
    expect(fields.split(FIELDS, { siteUrl: "https://acme", botToken: " xoxb-1 ", signingSecret: "" })).toEqual({
      config: { siteUrl: "https://acme" },
      values: [{ field: FIELDS[1], value: "xoxb-1" }],
    });
  });

  it("stores a new value as a secret the connection's credential points to", async () => {
    const { fields, credentials, secrets } = setup();
    await fields.save({ id: "conn-1", name: "Slack" }, [{ field: FIELDS[1], value: "xoxb-1" }]);
    expect(secrets.createSecret).toHaveBeenCalledWith({ name: "Slack Bot token", secretLocation: "database", secretValue: "xoxb-1" });
    expect(credentials.create).toHaveBeenCalledWith({
      integrationId: "conn-1",
      name: "botToken",
      credentialType: "secret_field",
      secretId: "secret-new",
    });
  });

  it("replaces the value of a field that has one", async () => {
    const { fields, credentials, secrets } = setup([stored("botToken", "secret-1")]);
    await fields.save({ id: "conn-1", name: "Slack" }, [{ field: FIELDS[1], value: "xoxb-2" }]);
    expect(secrets.updateSecret).toHaveBeenCalledWith("secret-1", { secretValue: "xoxb-2" });
    expect(secrets.createSecret).not.toHaveBeenCalled();
    expect(credentials.create).not.toHaveBeenCalled();
  });

  it("removes the stored values and their secrets, and leaves other credentials alone", async () => {
    const token: IntegrationCredential = { ...stored("default", "secret-token"), credentialType: "token" };
    const { fields, credentials, secrets } = setup([stored("botToken", "secret-1"), token]);
    await fields.removeAll("conn-1");
    expect(credentials.delete).toHaveBeenCalledTimes(1);
    expect(credentials.delete).toHaveBeenCalledWith("cred-botToken");
    expect(secrets.deleteSecret).toHaveBeenCalledWith("secret-1");
  });
});
