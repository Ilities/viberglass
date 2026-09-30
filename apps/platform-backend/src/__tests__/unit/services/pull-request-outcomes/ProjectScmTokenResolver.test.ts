import type { IntegrationCredential, ProjectScmConfig } from "@viberglass/types";
import { ProjectScmTokenResolver } from "../../../../services/pull-request-outcomes/ProjectScmTokenResolver";

function scmConfig(overrides: Partial<ProjectScmConfig> = {}): ProjectScmConfig {
  return {
    projectId: "project-1",
    integrationId: "integration-1",
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

describe("ProjectScmTokenResolver", () => {
  const getByProjectId = jest.fn();
  const getById = jest.fn();
  const getDefaultForIntegration = jest.fn();
  const resolveSecretsForClanker = jest.fn();
  const resolver = new ProjectScmTokenResolver(
    { getByProjectId },
    { getById, getDefaultForIntegration },
    { resolveSecretsForClanker },
  );

  beforeEach(() => {
    jest.resetAllMocks();
    resolveSecretsForClanker.mockResolvedValue({ GITHUB_TOKEN: "tok" });
  });

  it("uses the credential the project selected", async () => {
    getByProjectId.mockResolvedValue(scmConfig({ integrationCredentialId: "credential-2" }));
    getById.mockResolvedValue(credential({ id: "credential-2", secretId: "secret-2" }));

    await expect(resolver.resolve("project-1")).resolves.toBe("tok");
    expect(getById).toHaveBeenCalledWith("credential-2");
    expect(getDefaultForIntegration).not.toHaveBeenCalled();
    expect(resolveSecretsForClanker).toHaveBeenCalledWith(["secret-2"]);
  });

  it("falls back to the connection's default credential", async () => {
    getByProjectId.mockResolvedValue(scmConfig());
    getDefaultForIntegration.mockResolvedValue(credential());

    await expect(resolver.resolve("project-1")).resolves.toBe("tok");
    expect(getDefaultForIntegration).toHaveBeenCalledWith("integration-1");
  });

  it("returns null without an SCM config", async () => {
    getByProjectId.mockResolvedValue(null);

    await expect(resolver.resolve("project-1")).resolves.toBeNull();
  });

  it("returns null for a non-token credential", async () => {
    getByProjectId.mockResolvedValue(scmConfig());
    getDefaultForIntegration.mockResolvedValue(credential({ credentialType: "ssh_key" }));

    await expect(resolver.resolve("project-1")).resolves.toBeNull();
    expect(resolveSecretsForClanker).not.toHaveBeenCalled();
  });

  it("returns null when the secret has no value", async () => {
    getByProjectId.mockResolvedValue(scmConfig());
    getDefaultForIntegration.mockResolvedValue(credential());
    resolveSecretsForClanker.mockResolvedValue({ GITHUB_TOKEN: "  " });

    await expect(resolver.resolve("project-1")).resolves.toBeNull();
  });
});
