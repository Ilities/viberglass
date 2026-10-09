import type { IntegrationCredential, ProjectScmConfig } from "@viberglass/types";
import { ProjectRepositoryResolver } from "../../../../services/repositories/ProjectRepositoryResolver";
import { fakeRepositoryHost } from "../../../helpers/fakeRepositoryHost";

function scmConfig(overrides: Partial<ProjectScmConfig> = {}): ProjectScmConfig {
  return {
    projectId: "project-1",
    integrationId: "integration-1",
    integrationSystem: "code-host",
    sourceRepository: "https://github.com/acme/app",
    baseBranch: "main",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function credential(overrides: Partial<IntegrationCredential> = {}): IntegrationCredential {
  return {
    id: "credential-1",
    integrationId: "integration-1",
    name: "GitHub token",
    credentialType: "token",
    secretId: "secret-1",
    secretLocation: "database",
    isDefault: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ProjectRepositoryResolver", () => {
  const host = fakeRepositoryHost();
  const plugins = { get: (system: string) => (system === "code-host" ? { repository: host } : undefined) };
  const getByProjectId = jest.fn();
  const getById = jest.fn();
  const getDefaultForIntegration = jest.fn();
  const resolveSecretValue = jest.fn();
  const resolver = new ProjectRepositoryResolver(
    { getByProjectId },
    { getById, getDefaultForIntegration },
    { resolveSecretValue },
    plugins,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    resolveSecretValue.mockResolvedValue("tok");
  });

  it("uses the credential the project selected", async () => {
    getByProjectId.mockResolvedValue(scmConfig({ integrationCredentialId: "credential-2" }));
    getById.mockResolvedValue(credential({ id: "credential-2", secretId: "secret-2" }));

    await expect(resolver.resolve("project-1")).resolves.toEqual({ host, token: "tok" });
    expect(getById).toHaveBeenCalledWith("credential-2");
    expect(getDefaultForIntegration).not.toHaveBeenCalled();
    expect(resolveSecretValue).toHaveBeenCalledWith("secret-2");
  });

  it("falls back to the connection's default credential", async () => {
    getByProjectId.mockResolvedValue(scmConfig());
    getDefaultForIntegration.mockResolvedValue(credential());

    await expect(resolver.resolve("project-1")).resolves.toEqual({ host, token: "tok" });
    expect(getDefaultForIntegration).toHaveBeenCalledWith("integration-1");
  });

  it("says the space has no repository without an SCM config", async () => {
    getByProjectId.mockResolvedValue(null);

    await expect(resolver.resolve("project-1")).resolves.toEqual({ unavailable: "The space has no repository" });
  });

  it("says so when the space's connection isn't a code host in this build", async () => {
    getByProjectId.mockResolvedValue(scmConfig({ integrationSystem: "tracker-only" }));

    await expect(resolver.resolve("project-1")).resolves.toEqual({
      unavailable: "The space's code host can't read pull requests",
    });
    expect(getDefaultForIntegration).not.toHaveBeenCalled();
  });

  it("says there is no token for a non-token credential", async () => {
    getByProjectId.mockResolvedValue(scmConfig());
    getDefaultForIntegration.mockResolvedValue(credential({ credentialType: "ssh_key" }));

    await expect(resolver.resolve("project-1")).resolves.toEqual({ unavailable: "The space's repository connection has no token" });
    expect(resolveSecretValue).not.toHaveBeenCalled();
  });

  it("says there is no token when the secret has no value", async () => {
    getByProjectId.mockResolvedValue(scmConfig());
    getDefaultForIntegration.mockResolvedValue(credential());
    resolveSecretValue.mockResolvedValue("  ");

    await expect(resolver.resolve("project-1")).resolves.toEqual({ unavailable: "The space's repository connection has no token" });
  });
});
