import { SetupSecretStore } from "../../../../services/setup/SetupSecretStore";
import { setupSecretLocation } from "../../../../services/secretStorageDefaults";
import { SETUP_SERVICE_ERROR_CODE } from "../../../../services/errors/SetupServiceError";
import type { SecretLocation } from "../../../../persistence/secret/SecretDAO";
import type { SecretInput, SecretUpdate } from "../../../../services/SecretService";

jest.mock("../../../../persistence/secret/SecretDAO", () => ({ SecretDAO: jest.fn() }));
jest.mock("../../../../services/SecretService", () => ({ SecretService: jest.fn() }));

type Stored = { id: string; name: string; secretLocation: SecretLocation } | null;

function build(existing: Stored = null, location: "database" | "ssm" = "database") {
  const getSecret = jest.fn(async (_id: string) => existing);
  const getSecretByName = jest.fn(async (_name: string) => existing);
  const getLatestSecretForProvider = jest.fn(async (_provider: string) => existing);
  const createSecret = jest.fn(async (_input: SecretInput) => ({ id: "new-secret" }));
  const updateSecret = jest.fn(async (id: string, _updates: SecretUpdate) => ({ id }));
  const store = new SetupSecretStore({ getSecret, getSecretByName, getLatestSecretForProvider }, { createSecret, updateSecret }, location);
  return { store, createSecret, updateSecret };
}

describe("SetupSecretStore", () => {
  it("creates a provider's key labelled for people, with its provider", async () => {
    const { store, createSecret } = build();

    await expect(store.saveForProvider("anthropic", "Anthropic key", "key")).resolves.toBe("new-secret");
    expect(createSecret).toHaveBeenCalledWith({
      name: "Anthropic key",
      provider: "anthropic",
      secretLocation: "database",
      secretValue: "key",
    });
  });

  it("replaces the value of the provider's latest key", async () => {
    const { store, createSecret, updateSecret } = build({ id: "s1", name: "Anthropic key", secretLocation: "database" });

    await expect(store.saveForProvider("anthropic", "Anthropic key", "new")).resolves.toBe("s1");
    expect(createSecret).not.toHaveBeenCalled();
    expect(updateSecret).toHaveBeenCalledWith("s1", { secretValue: "new" });
  });

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

  it("creates a new secret in SSM when workers run on ECS", async () => {
    const { store, createSecret } = build(null, "ssm");

    await store.saveByName("OPENCODE_API_KEY", "key");
    expect(createSecret).toHaveBeenCalledWith({
      name: "OPENCODE_API_KEY",
      secretLocation: "ssm",
      secretValue: "key",
    });
  });

  it("moves a database secret to SSM when workers run on ECS", async () => {
    const { store, updateSecret } = build({ id: "s1", name: "K", secretLocation: "database" }, "ssm");

    await store.saveByName("K", "new");
    expect(updateSecret).toHaveBeenCalledWith("s1", { secretValue: "new", secretLocation: "ssm" });
  });

  it("keeps a database secret in the database without ECS", async () => {
    const { store, updateSecret } = build({ id: "s1", name: "K", secretLocation: "database" });

    await store.saveByName("K", "new");
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

  it("saves to SSM only when the ECS cluster is configured", () => {
    expect(setupSecretLocation({ VIBERATOR_ECS_CLUSTER_ARN: "arn:aws:ecs:eu-west-1:1:cluster/w" })).toBe("ssm");
    expect(setupSecretLocation({ VIBERATOR_ECS_CLUSTER_ARN: " " })).toBe("database");
    expect(setupSecretLocation({})).toBe("database");
  });
});
