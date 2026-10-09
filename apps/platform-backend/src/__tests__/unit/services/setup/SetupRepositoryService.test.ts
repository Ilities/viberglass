import type { Integration, IntegrationCredential } from "@viberglass/types";
import { SetupRepositoryService } from "../../../../services/setup/SetupRepositoryService";
import { SETUP_SERVICE_ERROR_CODE } from "../../../../services/errors/SetupServiceError";
import { RepositoryAccessError } from "@viberglass/integration-core";
import { fakeRepositoryHost } from "../../../helpers/fakeRepositoryHost";

jest.mock("../../../../persistence/integrations/IntegrationDAO", () => ({ IntegrationDAO: jest.fn() }));
jest.mock("../../../../persistence/integrations/IntegrationCredentialDAO", () => ({
  IntegrationCredentialDAO: jest.fn(),
}));
jest.mock("../../../../services/setup/SetupSecretStore", () => ({ SetupSecretStore: jest.fn() }));

const ACCESS = {
  fullName: "acme/web",
  url: "https://github.com/acme/web",
  defaultBranch: "main",
  isPrivate: true,
};

function integration(overrides: Partial<Integration> = {}): Integration {
  return {
    id: "integration-1",
    name: "GitHub",
    system: "github",
    config: {},
    isActive: true,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function credential(overrides: Partial<IntegrationCredential> = {}): IntegrationCredential {
  return {
    id: "credential-1",
    integrationId: "integration-1",
    name: "GITHUB_TOKEN",
    credentialType: "token",
    secretId: "secret-1",
    secretLocation: "database",
    isDefault: true,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function build(options: { integrations?: Integration[]; credentials?: IntegrationCredential[] } = {}) {
  const host = fakeRepositoryHost();
  // Reads owner/name and github.com addresses, the way the GitHub host does.
  host.parseRepository.mockImplementation((input: string) => {
    const match = input.match(/^(?:https:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    return match ? { fullName: `${match[1]}/${match[2]}`, url: `https://github.com/${match[1]}/${match[2]}` } : null;
  });
  host.checkAccess.mockResolvedValue(ACCESS);
  const check = host.checkAccess;
  const listIntegrations = jest.fn(async () => options.integrations ?? []);
  const createIntegration = jest.fn(async () => integration({ id: "integration-new" }));
  const listByIntegrationId = jest.fn(async () => options.credentials ?? []);
  const create = jest.fn(async () => credential({ id: "credential-new" }));
  const update = jest.fn(async () => credential());
  const saveByName = jest.fn(async () => "secret-new");
  const replaceById = jest.fn(async (id: string) => id);
  const service = new SetupRepositoryService(
    () => ({ system: "github", label: "GitHub", repository: host }),
    { listIntegrations, createIntegration },
    { listByIntegrationId, create, update },
    { saveByName, replaceById },
  );
  return { service, check, createIntegration, create, update, saveByName, replaceById };
}

describe("SetupRepositoryService", () => {
  it("creates the GitHub connection and its default token on a fresh workspace", async () => {
    const { service, check, createIntegration, saveByName, create } = build();

    const saved = await service.saveRepository("https://github.com/acme/web.git", " ghp_abc ");

    expect(check).toHaveBeenCalledWith({ fullName: "acme/web", url: "https://github.com/acme/web" }, "ghp_abc");
    expect(createIntegration).toHaveBeenCalledWith({ name: "GitHub", system: "github", config: {} });
    expect(saveByName).toHaveBeenCalledWith("GITHUB_TOKEN", "ghp_abc");
    expect(create).toHaveBeenCalledWith({
      integrationId: "integration-new",
      name: "GitHub token",
      credentialType: "token",
      secretId: "secret-new",
      isDefault: true,
    });
    expect(saved).toEqual({ ...ACCESS, integrationId: "integration-new", credentialId: "credential-new" });
  });

  it("replaces the token of the existing default credential", async () => {
    const { service, createIntegration, create, replaceById, update } = build({
      integrations: [integration()],
      credentials: [credential()],
    });

    const saved = await service.saveRepository("acme/web", "ghp_new");

    expect(createIntegration).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(replaceById).toHaveBeenCalledWith("secret-1", "ghp_new");
    expect(update).not.toHaveBeenCalled();
    expect(saved.credentialId).toBe("credential-1");
  });

  it("reuses a token credential that isn't the default, and makes it the default", async () => {
    const { service, create, replaceById, update } = build({
      integrations: [integration()],
      credentials: [credential({ isDefault: false })],
    });

    await service.saveRepository("acme/web", "ghp_new");

    expect(create).not.toHaveBeenCalled();
    expect(replaceById).toHaveBeenCalledWith("secret-1", "ghp_new");
    expect(update).toHaveBeenCalledWith("credential-1", { isDefault: true });
  });

  it("skips an inactive GitHub connection", async () => {
    const { service, createIntegration } = build({ integrations: [integration({ isActive: false })] });

    await service.saveRepository("acme/web", "ghp_abc");

    expect(createIntegration).toHaveBeenCalled();
  });

  it("explains a repository it can't read before contacting GitHub", async () => {
    const { service, check } = build();

    await expect(service.saveRepository("gitlab.com/acme/web", "t")).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.REPOSITORY_INVALID,
    });
    expect(check).not.toHaveBeenCalled();
  });

  it("passes on why the code host refused the token, as a setup error", async () => {
    const { service, check } = build();
    check.mockRejectedValue(new RepositoryAccessError("HOST_RATE_LIMITED", "Wait a few minutes."));

    await expect(service.saveRepository("acme/web", "t")).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.HOST_RATE_LIMITED,
      message: "Wait a few minutes.",
    });
  });

  it("explains that the installation has no code host to connect", async () => {
    const service = new SetupRepositoryService(() => null);

    await expect(service.saveRepository("acme/web", "t")).rejects.toMatchObject({ code: SETUP_SERVICE_ERROR_CODE.HOST_ERROR });
  });

  it("saves nothing when the check fails", async () => {
    const { service, check, saveByName, create } = build();
    check.mockRejectedValue(new Error("can't push"));

    await expect(service.saveRepository("acme/web", "t")).rejects.toThrow("can't push");
    expect(saveByName).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
