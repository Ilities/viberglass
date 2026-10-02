const mockSecretDao = {
  getSecret: jest.fn(),
  createSecret: jest.fn(),
  updateSecret: jest.fn(),
};

jest.mock("../../../persistence/secret/SecretDAO", () => ({
  SecretDAO: jest.fn(() => mockSecretDao),
}));

import { SecretService } from "../../../services/SecretService";

const VARIABLE = "VIBERGLASS_TEST_ENV_REFERENCE";

function storedSecret(overrides: Record<string, unknown> = {}) {
  return {
    id: "secret-1",
    name: "Server key",
    secretLocation: "database",
    secretPath: null,
    secretValueEncrypted: "encrypted",
    sourceEnvVar: null,
    provider: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("SecretService env references", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env[VARIABLE];
    mockSecretDao.createSecret.mockImplementation(async (input) => storedSecret(input));
    mockSecretDao.updateSecret.mockImplementation(async (_id, input) => storedSecret(input));
  });

  afterAll(() => {
    delete process.env[VARIABLE];
  });

  it("refuses to create an env secret whose variable is not set on the server", async () => {
    await expect(
      new SecretService().createSecret({ name: "Server key", secretLocation: "env", sourceEnvVar: VARIABLE }),
    ).rejects.toMatchObject({
      code: "ENV_VARIABLE_NOT_SET",
      message: expect.stringContaining("Store the value in the database instead"),
    });
    expect(mockSecretDao.createSecret).not.toHaveBeenCalled();
  });

  it("creates an env secret when the variable is set", async () => {
    process.env[VARIABLE] = "value";

    await new SecretService().createSecret({ name: "Server key", secretLocation: "env", sourceEnvVar: VARIABLE });

    expect(mockSecretDao.createSecret).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Server key", secretLocation: "env", sourceEnvVar: VARIABLE }),
    );
  });

  it("refuses an env secret that doesn't name a valid variable", async () => {
    await expect(
      new SecretService().createSecret({ name: "Server key", secretLocation: "env", sourceEnvVar: "not a var" }),
    ).rejects.toMatchObject({ code: "SOURCE_ENV_VAR_INVALID" });
  });

  it("refuses to switch a stored secret to an unset env variable", async () => {
    mockSecretDao.getSecret.mockResolvedValue(storedSecret());

    await expect(
      new SecretService().updateSecret("secret-1", { secretLocation: "env", sourceEnvVar: VARIABLE }),
    ).rejects.toMatchObject({ code: "ENV_VARIABLE_NOT_SET" });
    expect(mockSecretDao.updateSecret).not.toHaveBeenCalled();
  });

  it("leaves existing env secrets editable without re-checking the variable", async () => {
    mockSecretDao.getSecret.mockResolvedValue(
      storedSecret({ secretLocation: "env", secretValueEncrypted: null, sourceEnvVar: VARIABLE }),
    );

    await new SecretService().updateSecret("secret-1", { name: "Renamed" });

    expect(mockSecretDao.updateSecret).toHaveBeenCalled();
  });
});
