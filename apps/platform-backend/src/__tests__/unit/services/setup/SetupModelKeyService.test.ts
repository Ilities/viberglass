import { SetupModelKeyService } from "../../../../services/setup/SetupModelKeyService";
import {
  SETUP_SERVICE_ERROR_CODE,
  SetupServiceError,
} from "../../../../services/errors/SetupServiceError";

jest.mock("../../../../services/setup/SetupSecretStore", () => ({ SetupSecretStore: jest.fn() }));

function build() {
  const check = jest.fn(async (_provider: string, _key: string) => undefined);
  const saveForProvider = jest.fn(async (_provider: string, _name: string, _value: string) => "secret-1");
  const service = new SetupModelKeyService({ check }, { saveForProvider });
  return { service, check, saveForProvider };
}

describe("SetupModelKeyService", () => {
  it("checks the key and saves it as the provider's key", async () => {
    const { service, check, saveForProvider } = build();

    const saved = await service.saveModelKey("opencode-go", "  key-123  ");

    expect(check).toHaveBeenCalledWith("opencode-go", "key-123");
    expect(saveForProvider).toHaveBeenCalledWith("opencode-go", "OpenCode Go key", "key-123");
    expect(saved).toEqual({
      provider: "opencode-go",
      providerName: "OpenCode Go",
      agent: "opencode",
      agentName: "OpenCode",
      secretId: "secret-1",
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
    const { service, check, saveForProvider } = build();
    check.mockRejectedValue(
      new SetupServiceError(SETUP_SERVICE_ERROR_CODE.KEY_REJECTED, "rejected"),
    );

    await expect(service.saveModelKey("openai", "sk-abc")).rejects.toThrow("rejected");
    expect(saveForProvider).not.toHaveBeenCalled();
  });
});
