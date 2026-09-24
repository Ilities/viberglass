import { SetupModelKeyService } from "../../../../services/setup/SetupModelKeyService";
import {
  SETUP_SERVICE_ERROR_CODE,
  SetupServiceError,
} from "../../../../services/errors/SetupServiceError";

jest.mock("../../../../services/setup/SetupSecretStore", () => ({ SetupSecretStore: jest.fn() }));

function build() {
  const check = jest.fn(async (_provider: string, _key: string) => undefined);
  const saveByName = jest.fn(async (_name: string, _value: string) => "secret-1");
  const service = new SetupModelKeyService({ check }, { saveByName });
  return { service, check, saveByName };
}

describe("SetupModelKeyService", () => {
  it("checks the key and saves it under the default harness's env var", async () => {
    const { service, check, saveByName } = build();

    const saved = await service.saveModelKey("opencode-go", "  key-123  ");

    expect(check).toHaveBeenCalledWith("opencode-go", "key-123");
    expect(saveByName).toHaveBeenCalledWith("OPENCODE_API_KEY", "key-123");
    expect(saved).toEqual({
      provider: "opencode-go",
      providerName: "OpenCode Go",
      agent: "opencode",
      agentName: "OpenCode",
      secretId: "secret-1",
      secretName: "OPENCODE_API_KEY",
    });
  });

  it("rejects a key in the wrong format before calling the provider", async () => {
    const { service, check } = build();

    await expect(service.saveModelKey("openai", "sk-ant-abc")).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.KEY_FORMAT_INVALID,
      statusCode: 400,
    });
    expect(check).not.toHaveBeenCalled();
  });

  it("saves nothing when the provider rejects the key", async () => {
    const { service, check, saveByName } = build();
    check.mockRejectedValue(
      new SetupServiceError(SETUP_SERVICE_ERROR_CODE.KEY_REJECTED, "rejected"),
    );

    await expect(service.saveModelKey("openai", "sk-abc")).rejects.toThrow("rejected");
    expect(saveByName).not.toHaveBeenCalled();
  });
});
