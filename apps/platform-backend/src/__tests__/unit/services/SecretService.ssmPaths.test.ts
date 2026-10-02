const mockSecretDao = {
  getSecret: jest.fn(),
  getSecretsByIds: jest.fn(),
  createSecret: jest.fn(),
  updateSecret: jest.fn(),
};
const mockSend = jest.fn();

jest.mock("../../../persistence/secret/SecretDAO", () => ({
  SecretDAO: jest.fn(() => mockSecretDao),
}));
jest.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: jest.fn(() => ({ send: mockSend })),
  GetParameterCommand: jest.fn((input) => ({ kind: "get", input })),
  PutParameterCommand: jest.fn((input) => ({ kind: "put", input })),
  DeleteParameterCommand: jest.fn((input) => ({ kind: "delete", input })),
}));

import { SecretService } from "../../../services/SecretService";

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Team Anthropic key",
    secretLocation: "ssm",
    secretPath: "/viberator/secrets/11111111-1111-1111-1111-111111111111",
    secretValueEncrypted: null,
    sourceEnvVar: null,
    provider: "anthropic",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("SecretService SSM paths", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SECRETS_SSM_PREFIX;
    mockSend.mockResolvedValue({ Parameter: { Value: "stored-value" } });
    mockSecretDao.createSecret.mockImplementation(async (input) => stored(input));
    mockSecretDao.updateSecret.mockImplementation(async (_id, input) => stored(input));
  });

  it("stores a new SSM secret under the prefix by its id, not its label", async () => {
    await new SecretService().createSecret({ name: "Team Anthropic key", secretLocation: "ssm", secretValue: "sk" });

    const { id, secretPath } = mockSecretDao.createSecret.mock.calls[0][0];
    expect(secretPath).toBe(`/viberator/secrets/${id}`);
    expect(mockSend).toHaveBeenCalledWith({ kind: "put", input: expect.objectContaining({ Name: secretPath }) });
  });

  it("keeps the parameter where it is when the secret is renamed", async () => {
    mockSecretDao.getSecret.mockResolvedValue(stored({ secretPath: "/viberator/secrets/ANTHROPIC_API_KEY" }));

    await new SecretService().updateSecret("11111111-1111-1111-1111-111111111111", { name: "Renamed key" });

    expect(mockSecretDao.updateSecret).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      expect.objectContaining({ name: "Renamed key", secretPath: "/viberator/secrets/ANTHROPIC_API_KEY" }),
    );
    expect(mockSend).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "delete" }));
  });

  it("resolves only the secrets asked for, by id", async () => {
    mockSecretDao.getSecretsByIds.mockResolvedValue([stored()]);

    const values = await new SecretService().resolveSecretValues(["11111111-1111-1111-1111-111111111111"]);

    expect(mockSecretDao.getSecretsByIds).toHaveBeenCalledWith(["11111111-1111-1111-1111-111111111111"]);
    expect(values.get("11111111-1111-1111-1111-111111111111")).toBe("stored-value");
  });
});
