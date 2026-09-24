import { SetupModelKeyService } from "../../../../services/setup/SetupModelKeyService";
import type { SecretLocation } from "../../../../persistence/secret/SecretDAO";
import type { SecretInput, SecretUpdate } from "../../../../services/SecretService";
import {
  SETUP_SERVICE_ERROR_CODE,
  SetupServiceError,
} from "../../../../services/errors/SetupServiceError";

jest.mock("../../../../persistence/secret/SecretDAO", () => ({ SecretDAO: jest.fn() }));
jest.mock("../../../../services/SecretService", () => ({ SecretService: jest.fn() }));

function build(existing: { id: string; secretLocation: SecretLocation } | null = null) {
  const check = jest.fn(async (_provider: string, _key: string) => undefined);
  const getSecretByName = jest.fn(async (_name: string) => existing);
  const createSecret = jest.fn(async (_input: SecretInput) => ({ id: "new-secret" }));
  const updateSecret = jest.fn(async (id: string, _updates: SecretUpdate) => ({ id }));
  const service = new SetupModelKeyService(
    { check },
    { getSecretByName },
    { createSecret, updateSecret },
  );
  return { service, check, getSecretByName, createSecret, updateSecret };
}

describe("SetupModelKeyService", () => {
  it("checks the key and stores it encrypted under the default harness's env var", async () => {
    const { service, check, createSecret } = build();

    const saved = await service.saveModelKey("opencode-go", "  key-123  ");

    expect(check).toHaveBeenCalledWith("opencode-go", "key-123");
    expect(createSecret).toHaveBeenCalledWith({
      name: "OPENCODE_API_KEY",
      secretLocation: "database",
      secretValue: "key-123",
    });
    expect(saved).toEqual({
      provider: "opencode-go",
      providerName: "OpenCode Go",
      agent: "opencode",
      agentName: "OpenCode",
      secretId: "new-secret",
      secretName: "OPENCODE_API_KEY",
    });
  });

  it("replaces the stored key when saved again, keeping where it's stored", async () => {
    const { service, createSecret, updateSecret } = build({ id: "s1", secretLocation: "ssm" });

    await service.saveModelKey("anthropic", "sk-ant-new");

    expect(createSecret).not.toHaveBeenCalled();
    expect(updateSecret).toHaveBeenCalledWith("s1", { secretValue: "sk-ant-new" });
  });

  it("won't overwrite a secret that comes from the server environment", async () => {
    const { service, updateSecret } = build({ id: "s1", secretLocation: "env" });

    await expect(service.saveModelKey("anthropic", "sk-ant-new")).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.SECRET_MANAGED_ELSEWHERE,
      statusCode: 409,
    });
    expect(updateSecret).not.toHaveBeenCalled();
  });

  it("rejects a key in the wrong format before calling the provider", async () => {
    const { service, check } = build();

    await expect(service.saveModelKey("openai", "sk-ant-abc")).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.KEY_FORMAT_INVALID,
      statusCode: 400,
    });
    expect(check).not.toHaveBeenCalled();
  });

  it("stores nothing when the provider rejects the key", async () => {
    const { service, check, createSecret } = build();
    check.mockRejectedValue(
      new SetupServiceError(SETUP_SERVICE_ERROR_CODE.KEY_REJECTED, "rejected"),
    );

    await expect(service.saveModelKey("openai", "sk-abc")).rejects.toThrow("rejected");
    expect(createSecret).not.toHaveBeenCalled();
  });
});
