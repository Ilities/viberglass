import { WebhookHandshake } from "../../../webhooks/WebhookHandshake";
import type { WebhookConfig } from "../../../persistence/webhook/WebhookConfigDAO";

function config(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  return { id: "cfg-1", secretLocation: "database", webhookSecretEncrypted: null, ...overrides } as unknown as WebhookConfig;
}

describe("WebhookHandshake", () => {
  it("stores the handshake secret encrypted on a webhook that has none", async () => {
    const configDAO = { updateConfig: jest.fn().mockResolvedValue(undefined) };
    const secrets = { encryptSecret: jest.fn().mockResolvedValue("encrypted-1") };

    await new WebhookHandshake(configDAO, secrets).remember(config(), "secret-1");

    expect(secrets.encryptSecret).toHaveBeenCalledWith("secret-1");
    expect(configDAO.updateConfig).toHaveBeenCalledWith("cfg-1", { webhookSecretEncrypted: "encrypted-1" });
  });

  it("keeps the secret a webhook already has, so a handshake can't replace it", async () => {
    const configDAO = { updateConfig: jest.fn() };
    const secrets = { encryptSecret: jest.fn() };

    await new WebhookHandshake(configDAO, secrets).remember(config({ webhookSecretEncrypted: "existing" }), "secret-2");

    expect(configDAO.updateConfig).not.toHaveBeenCalled();
    expect(secrets.encryptSecret).not.toHaveBeenCalled();
  });

  it("stores nothing for a webhook whose secret lives outside the database", async () => {
    const configDAO = { updateConfig: jest.fn() };
    await new WebhookHandshake(configDAO, { encryptSecret: jest.fn() }).remember(config({ secretLocation: "ssm" }), "secret-3");

    expect(configDAO.updateConfig).not.toHaveBeenCalled();
  });
});
