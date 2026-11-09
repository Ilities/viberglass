import { WebhookSecretCipher } from "../../../webhooks/WebhookSecretCipher";
import { WebhookSecretService } from "../../../webhooks/WebhookSecretService";

const credentials = { get: jest.fn().mockResolvedValue("from-ssm") };

describe("WebhookSecretCipher", () => {
  it("encrypts a secret so only the same key reads it back", () => {
    const cipher = new WebhookSecretCipher("key-one");
    const encrypted = cipher.encrypt("hook-secret");

    expect(encrypted).not.toContain("hook-secret");
    expect(encrypted.split(":")).toHaveLength(3);
    expect(cipher.decrypt(encrypted)).toBe("hook-secret");
    expect(() => new WebhookSecretCipher("key-two").decrypt(encrypted)).toThrow();
  });

  it("refuses a value that isn't encrypted, and works without a key only until it is used", () => {
    expect(() => new WebhookSecretCipher("key-one").decrypt("plain-secret")).toThrow("Invalid encrypted secret format");

    const previous = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    try {
      const cipher = new WebhookSecretCipher();
      expect(() => cipher.encrypt("hook-secret")).toThrow("WEBHOOK_SECRET_ENCRYPTION_KEY");
    } finally {
      if (previous !== undefined) process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previous;
    }
  });
});

describe("WebhookSecretService", () => {
  it("decrypts a secret kept in the database", async () => {
    const cipher = new WebhookSecretCipher("key-one");
    const service = new WebhookSecretService(credentials, cipher);

    await expect(service.getSecret({ secretLocation: "database", webhookSecret: cipher.encrypt("hook-secret") })).resolves.toBe("hook-secret");
    await expect(service.getSecret({ secretLocation: "database", webhookSecret: "plain-secret" })).rejects.toThrow();
  });

  it("reads a secret kept in SSM as it is", async () => {
    const service = new WebhookSecretService(credentials, new WebhookSecretCipher("key-one"));

    await expect(service.getSecret({ secretLocation: "ssm", secretPath: "/hooks/a" }, "tenant-1")).resolves.toBe("from-ssm");
    expect(credentials.get).toHaveBeenCalledWith("tenant-1", "/hooks/a");
  });
});
