import type { Integration, IntegrationCredential, ProjectScmConfig } from "@viberglass/types";
import type { ProjectConfig } from "../../../../models/PMIntegration";
import { SetupSpaceService } from "../../../../services/setup/SetupSpaceService";
import { SETUP_SERVICE_ERROR_CODE } from "../../../../services/errors/SetupServiceError";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const GITHUB: Integration = {
  id: "integration-1",
  name: "GitHub",
  system: "github",
  config: {},
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

const TOKEN: IntegrationCredential = {
  id: "credential-1",
  integrationId: "integration-1",
  name: "GitHub token",
  credentialType: "token",
  secretId: "secret-1",
  secretLocation: "database",
  isDefault: true,
  createdAt: "",
  updatedAt: "",
};

function project(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    id: "project-1",
    name: "Web",
    slug: "web",
    ticketSystem: "custom",
    credentials: { type: "token" },
    autoFixEnabled: false,
    autoFixTags: [],
    customFieldMappings: {},
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function scmConfig(sourceRepository: string): ProjectScmConfig {
  return {
    projectId: "project-1",
    integrationId: "integration-1",
    sourceRepository,
    baseBranch: "main",
    createdAt: "",
    updatedAt: "",
  };
}

function build(options: {
  existing?: ProjectConfig | null;
  scm?: ProjectScmConfig | null;
  linked?: boolean;
  integrations?: Integration[];
  credential?: IntegrationCredential | null;
} = {}) {
  const findByName = jest.fn(async (_slug: string) => options.existing ?? null);
  const createProject = jest.fn(async () => project());
  const getByProjectId = jest.fn(async () => options.scm ?? null);
  const upsertByProjectId = jest.fn(async () => scmConfig("x"));
  const isLinked = jest.fn(async () => options.linked ?? false);
  const linkIntegration = jest.fn(async () => undefined);
  const listIntegrations = jest.fn(async () => options.integrations ?? [GITHUB]);
  const getDefaultForIntegration = jest.fn(async () =>
    options.credential === undefined ? TOKEN : options.credential,
  );
  const service = new SetupSpaceService(
    { findByName, createProject },
    { getByProjectId, upsertByProjectId },
    { isLinked, linkIntegration },
    { listIntegrations },
    { getDefaultForIntegration },
  );
  return { service, findByName, createProject, upsertByProjectId, linkIntegration };
}

describe("SetupSpaceService", () => {
  it("creates the space on the connected repository with its token", async () => {
    const { service, findByName, createProject, linkIntegration, upsertByProjectId } = build();

    const space = await service.createSpace({
      name: " Web ",
      repository: "https://github.com/Acme/web",
      baseBranch: "develop",
    });

    expect(findByName).toHaveBeenCalledWith("web");
    expect(createProject).toHaveBeenCalledWith(expect.objectContaining({ name: "Web", ticketSystem: "custom" }));
    expect(linkIntegration).toHaveBeenCalledWith({
      projectId: "project-1",
      integrationId: "integration-1",
      isPrimary: true,
    });
    expect(upsertByProjectId).toHaveBeenCalledWith("project-1", {
      integrationId: "integration-1",
      sourceRepository: "https://github.com/Acme/web",
      baseBranch: "develop",
      integrationCredentialId: "credential-1",
    });
    expect(space).toEqual({
      projectId: "project-1",
      name: "Web",
      slug: "web",
      repositoryUrl: "https://github.com/Acme/web",
      baseBranch: "develop",
    });
  });

  it("finishes a half-created space when run again", async () => {
    const { service, createProject, linkIntegration, upsertByProjectId } = build({
      existing: project(),
      scm: null,
      linked: true,
    });

    await service.createSpace({ name: "Web", repository: "acme/web" });

    expect(createProject).not.toHaveBeenCalled();
    expect(linkIntegration).not.toHaveBeenCalled();
    expect(upsertByProjectId).toHaveBeenCalled();
  });

  it("reuses a space already on the same repository, whatever the case", async () => {
    const { service, createProject } = build({
      existing: project(),
      scm: scmConfig("https://github.com/acme/web"),
    });

    await expect(service.createSpace({ name: "Web", repository: "Acme/Web" })).resolves.toMatchObject({
      projectId: "project-1",
    });
    expect(createProject).not.toHaveBeenCalled();
  });

  it("won't repoint a space that uses another repository", async () => {
    const { service, upsertByProjectId } = build({
      existing: project(),
      scm: scmConfig("https://github.com/acme/api"),
    });

    await expect(service.createSpace({ name: "web", repository: "acme/web" })).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.SPACE_EXISTS,
      message: 'There\'s already a space called "Web". Choose another name.',
    });
    expect(upsertByProjectId).not.toHaveBeenCalled();
  });

  it("won't reuse an archived space", async () => {
    const { service } = build({ existing: project({ archivedAt: "2026-09-01" }), scm: null });

    await expect(service.createSpace({ name: "Web", repository: "acme/web" })).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.SPACE_EXISTS,
      message: expect.stringContaining("(archived)"),
    });
  });

  it("needs the repository step first", async () => {
    const { service, createProject } = build({ credential: null });

    await expect(service.createSpace({ name: "Web", repository: "acme/web" })).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.REPOSITORY_NOT_CONNECTED,
    });
    expect(createProject).not.toHaveBeenCalled();
  });

  it("refuses a name without letters or numbers", async () => {
    const { service } = build();

    await expect(service.createSpace({ name: "!!!", repository: "acme/web" })).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.SPACE_NAME_INVALID,
    });
  });
});
