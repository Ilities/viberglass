const mockSecretDao = {
  getSecretByName: jest.fn(),
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
    name: VARIABLE,
    secretLocation: "database",
    secretPath: null,
    secretValueEncrypted: "encrypted",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("SecretService env references", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env[VARIABLE];
    mockSecretDao.getSecretByName.mockResolvedValue(null);
    mockSecretDao.createSecret.mockImplementation(async (input) => storedSecret(input));
    mockSecretDao.updateSecret.mockImplementation(async (_id, input) => storedSecret(input));
  });

  afterAll(() => {
    delete process.env[VARIABLE];
  });

  it("refuses to create an env secret whose variable is not set on the server", async () => {
    await expect(
      new SecretService().createSecret({ name: VARIABLE, secretLocation: "env" }),
    ).rejects.toMatchObject({
      code: "ENV_VARIABLE_NOT_SET",
      message: expect.stringContaining("Store the value in the database instead"),
    });
    expect(mockSecretDao.createSecret).not.toHaveBeenCalled();
  });

  it("creates an env secret when the variable is set", async () => {
    process.env[VARIABLE] = "value";

    await new SecretService().createSecret({ name: VARIABLE, secretLocation: "env" });

    expect(mockSecretDao.createSecret).toHaveBeenCalledWith(
      expect.objectContaining({ name: VARIABLE, secretLocation: "env" }),
    );
  });

  it("refuses to switch a stored secret to an unset env variable", async () => {
    mockSecretDao.getSecret.mockResolvedValue(storedSecret());

    await expect(
      new SecretService().updateSecret("secret-1", { secretLocation: "env" }),
    ).rejects.toMatchObject({ code: "ENV_VARIABLE_NOT_SET" });
    expect(mockSecretDao.updateSecret).not.toHaveBeenCalled();
  });

  it("leaves existing env secrets editable without re-checking the variable", async () => {
    mockSecretDao.getSecret.mockResolvedValue(
      storedSecret({ secretLocation: "env", secretValueEncrypted: null }),
    );

    await new SecretService().updateSecret("secret-1", { secretLocation: "env" });

    expect(mockSecretDao.updateSecret).toHaveBeenCalled();
  });
});
