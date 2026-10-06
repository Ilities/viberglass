import { ModelHostAccountService } from "../../../../services/modelHosting/ModelHostAccountService";
import type {
  ModelHostAccountRecord,
  ModelHostAccountValues,
} from "../../../../persistence/modelHosting/ModelHostAccountDAO";
import type { SecretInput } from "../../../../services/SecretService";

function record(values: ModelHostAccountValues): ModelHostAccountRecord {
  return {
    ...values,
    id: "account-1",
    hasHuggingFaceToken: values.huggingFaceTokenSecretId !== null,
    createdAt: "",
    updatedAt: "",
  };
}

function fixture() {
  let stored: ModelHostAccountRecord | null = null;
  const accounts = {
    list: jest.fn(async () => (stored ? [stored] : [])),
    get: jest.fn(async () => stored),
    create: jest.fn(async (values: ModelHostAccountValues) => (stored = record(values))),
    update: jest.fn(async (_id: string, values: ModelHostAccountValues) => (stored = record(values))),
    delete: jest.fn(async () => {}),
    deploymentNames: jest.fn(async (): Promise<string[]> => []),
  };
  let next = 0;
  const secrets = {
    createSecret: jest.fn(async (input: SecretInput) => ({
      id: `secret-${++next}`,
      name: input.name,
      secretLocation: input.secretLocation,
      secretPath: null,
      sourceEnvVar: null,
      provider: null,
      purpose: input.purpose ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    updateSecret: jest.fn(),
    deleteSecret: jest.fn(async (_id: string) => true),
  };
  return {
    accounts,
    secrets,
    service: new ModelHostAccountService(accounts, secrets, "database"),
  };
}

const input = {
  name: "Verda EU",
  host: "verda" as const,
  clientId: "client",
  clientSecret: "secret",
  endpointKey: "inference",
};

describe("cloud accounts", () => {
  test("keeps credentials as platform-managed secrets and never returns their ids", async () => {
    const { service, secrets } = fixture();
    const account = await service.create({ ...input, huggingFaceToken: "hf" });
    expect(secrets.createSecret.mock.calls.map(([call]) => [call.name, call.purpose, call.secretValue])).toEqual([
      ["Verda EU · client secret", "model_host", "secret"],
      ["Verda EU · inference key", "model_host", "inference"],
      ["Verda EU · Hugging Face token", "model_host", "hf"],
    ]);
    expect(account).toEqual(expect.objectContaining({ clientId: "client", hasHuggingFaceToken: true }));
    expect(account).not.toHaveProperty("clientSecretId");
  });

  test("requires the client secret and inference key when creating", async () => {
    const { service, secrets } = fixture();
    await expect(service.create({ ...input, endpointKey: undefined })).rejects.toThrow("inference key");
    expect(secrets.createSecret).not.toHaveBeenCalled();
  });

  test("removes the secrets it stored when the account can't be saved", async () => {
    const { service, secrets, accounts } = fixture();
    accounts.create.mockRejectedValueOnce(new Error("duplicate"));
    await expect(service.create(input)).rejects.toThrow("duplicate");
    expect(secrets.deleteSecret.mock.calls.map(([id]) => id)).toEqual(["secret-1", "secret-2"]);
  });

  test("updates only the credentials given and removes a cleared Hugging Face token", async () => {
    const { service, secrets } = fixture();
    await service.create({ ...input, huggingFaceToken: "hf" });
    secrets.createSecret.mockClear();
    const updated = await service.update("account-1", {
      name: "Verda EU",
      host: "verda",
      clientId: "client-2",
      endpointKey: "new-key",
      huggingFaceToken: "",
    });
    expect(secrets.updateSecret).toHaveBeenCalledTimes(1);
    expect(secrets.updateSecret).toHaveBeenCalledWith("secret-2", { secretValue: "new-key" });
    expect(secrets.deleteSecret).toHaveBeenCalledWith("secret-3");
    expect(updated).toMatchObject({ clientId: "client-2", hasHuggingFaceToken: false });
  });

  test("refuses to delete an account that still has deployments", async () => {
    const { service, accounts, secrets } = fixture();
    await service.create(input);
    accounts.deploymentNames.mockResolvedValueOnce(["Qwen"]);
    await expect(service.delete("account-1")).rejects.toMatchObject({ statusCode: 409 });
    await service.delete("account-1");
    expect(secrets.deleteSecret.mock.calls.map(([id]) => id).sort()).toEqual(["secret-1", "secret-2"]);
  });
});
