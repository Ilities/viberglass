import type { Integration, IntegrationCredential } from "@viberglass/types";
import { SetupRepositoryService } from "../../../../services/setup/SetupRepositoryService";
import { SETUP_SERVICE_ERROR_CODE } from "../../../../services/errors/SetupServiceError";
import { RepositoryAccessError } from "@viberglass/integration-core";
import { fakeCreatingRepositoryHost, fakeRepositoryHost } from "../../../helpers/fakeRepositoryHost";

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
  const host = fakeCreatingRepositoryHost();
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
  return { service, host, check, createIntegration, create, update, saveByName, replaceById };
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

  describe("creating a repository", () => {
    const CREATED = { ...ACCESS, fullName: "acme/laptops", url: "https://github.com/acme/laptops" };

    it("lists where the token can create one", async () => {
      const { service, host } = build();
      host.creator.listOwners.mockResolvedValue([{ name: "jane", kind: "user" }]);

      await expect(service.listOwners(" ghp_abc ")).resolves.toEqual([{ name: "jane", kind: "user" }]);
      expect(host.creator.listOwners).toHaveBeenCalledWith("ghp_abc");
    });

    it("creates it, checks the token can push to it, and saves the token like a pasted repository", async () => {
      const { service, host, check, saveByName } = build();
      host.creator.createRepository.mockResolvedValue(CREATED);
      check.mockResolvedValue(CREATED);

      const saved = await service.createRepository({ owner: "acme", name: "laptops" }, "ghp_abc");

      expect(host.creator.createRepository).toHaveBeenCalledWith({ owner: "acme", name: "laptops" }, "ghp_abc");
      expect(check).toHaveBeenCalledWith({ fullName: "acme/laptops", url: "https://github.com/acme/laptops" }, "ghp_abc");
      expect(saveByName).toHaveBeenCalledWith("GITHUB_TOKEN", "ghp_abc");
      expect(saved).toEqual({ ...CREATED, integrationId: "integration-new", credentialId: "credential-new" });
    });

    it("says what the token needs when the host won't create it, and saves nothing", async () => {
      const { service, host, saveByName } = build();
      host.creator.createRepository.mockRejectedValue(
        new RepositoryAccessError("CREATE_FORBIDDEN", "This token can't create repositories in acme: it needs more."),
      );

      await expect(service.createRepository({ owner: "acme", name: "laptops" }, "t")).rejects.toMatchObject({
        code: SETUP_SERVICE_ERROR_CODE.CREATE_FORBIDDEN,
        statusCode: 422,
        message: "This token can't create repositories in acme: it needs more.",
      });
      expect(saveByName).not.toHaveBeenCalled();
    });

    it("says the repository was created when the token then can't push to it", async () => {
      const { service, host, check, saveByName } = build();
      host.creator.createRepository.mockResolvedValue(CREATED);
      check.mockRejectedValue(new RepositoryAccessError("REPOSITORY_NOT_FOUND", "Couldn't find acme/laptops with this token."));

      await expect(service.createRepository({ owner: "acme", name: "laptops" }, "t")).rejects.toMatchObject({
        code: SETUP_SERVICE_ERROR_CODE.REPOSITORY_NOT_FOUND,
        message: expect.stringMatching(/^Created acme\/laptops, but this token can't work in it yet\. Couldn't find/),
      });
      expect(saveByName).not.toHaveBeenCalled();
    });

    it("refuses a token with spaces before contacting the host", async () => {
      const { service, host } = build();

      await expect(service.createRepository({ owner: "acme", name: "laptops" }, "two words")).rejects.toMatchObject({
        code: SETUP_SERVICE_ERROR_CODE.TOKEN_FORMAT_INVALID,
      });
      expect(host.creator.createRepository).not.toHaveBeenCalled();
    });

    it("explains when the code host can't create repositories", async () => {
      const service = new SetupRepositoryService(() => ({ system: "github", label: "GitHub", repository: fakeRepositoryHost() }));

      await expect(service.listOwners("t")).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("can't create repositories") });
    });
  });
});
