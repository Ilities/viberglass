import { SetupSecretStore } from "../../../../services/setup/SetupSecretStore";
import { SETUP_SERVICE_ERROR_CODE } from "../../../../services/errors/SetupServiceError";
import type { SecretLocation } from "../../../../persistence/secret/SecretDAO";
import type { SecretInput, SecretUpdate } from "../../../../services/SecretService";

jest.mock("../../../../persistence/secret/SecretDAO", () => ({ SecretDAO: jest.fn() }));
jest.mock("../../../../services/SecretService", () => ({ SecretService: jest.fn() }));

type Stored = { id: string; name: string; secretLocation: SecretLocation } | null;

function build(existing: Stored = null) {
  const getSecret = jest.fn(async (_id: string) => existing);
  const getSecretByName = jest.fn(async (_name: string) => existing);
  const createSecret = jest.fn(async (_input: SecretInput) => ({ id: "new-secret" }));
  const updateSecret = jest.fn(async (id: string, _updates: SecretUpdate) => ({ id }));
  const store = new SetupSecretStore({ getSecret, getSecretByName }, { createSecret, updateSecret });
  return { store, createSecret, updateSecret };
}

describe("SetupSecretStore", () => {
  it("creates a new secret encrypted in the database", async () => {
    const { store, createSecret } = build();

    await expect(store.saveByName("OPENCODE_API_KEY", "key")).resolves.toBe("new-secret");
    expect(createSecret).toHaveBeenCalledWith({
      name: "OPENCODE_API_KEY",
      secretLocation: "database",
      secretValue: "key",
    });
  });

  it("replaces the value of an existing secret where it's stored", async () => {
    const { store, createSecret, updateSecret } = build({ id: "s1", name: "K", secretLocation: "ssm" });

    await expect(store.saveByName("K", "new")).resolves.toBe("s1");
    expect(createSecret).not.toHaveBeenCalled();
    expect(updateSecret).toHaveBeenCalledWith("s1", { secretValue: "new" });
  });

  it("refuses to replace a secret read from the server environment", async () => {
    const { store, updateSecret } = build({ id: "s1", name: "GITHUB_TOKEN", secretLocation: "env" });

    await expect(store.replaceById("s1", "new")).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.SECRET_MANAGED_ELSEWHERE,
      message: expect.stringContaining("GITHUB_TOKEN is read from the server's environment"),
    });
    expect(updateSecret).not.toHaveBeenCalled();
  });
});
