const mockProjectDAO = { getProject: jest.fn() };
const mockScmConfigDAO = { getByProjectId: jest.fn() };
const mockCredentialDAO = { getById: jest.fn() };
const mockClankerDAO = { listClankers: jest.fn() };

jest.mock("../../../persistence/project/ProjectDAO", () => ({
  ProjectDAO: jest.fn(() => mockProjectDAO),
}));
jest.mock("../../../persistence/project/ProjectScmConfigDAO", () => ({
  ProjectScmConfigDAO: jest.fn(() => mockScmConfigDAO),
}));
jest.mock("../../../persistence/integrations", () => ({
  IntegrationCredentialDAO: jest.fn(() => mockCredentialDAO),
}));
jest.mock("../../../persistence/clanker/ClankerDAO", () => ({
  ClankerDAO: jest.fn(() => mockClankerDAO),
}));

import { ProjectReadinessService } from "../../../services/ProjectReadinessService";

describe("ProjectReadinessService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProjectDAO.getProject.mockResolvedValue({ id: "project-1", slug: "shop" });
    mockScmConfigDAO.getByProjectId.mockResolvedValue({
      sourceRepository: "acme/shop",
      integrationId: "scm-1",
      integrationCredentialId: "credential-1",
    });
    mockCredentialDAO.getById.mockResolvedValue({
      integrationId: "scm-1",
      expiresAt: null,
    });
    mockClankerDAO.listClankers.mockResolvedValue([
      {
        status: "active",
        deploymentStrategyId: "strategy-1",
        secretIds: ["secret-1"],
      },
    ]);
  });

  it("reports a configured project as automation-ready", async () => {
    const readiness = await new ProjectReadinessService().getReadiness("project-1");

    expect(readiness?.automationAvailable).toBe(true);
    expect(readiness?.checks.every((check) => check.state === "ready")).toBe(true);
  });

  it("distinguishes repository, credential, and runner setup failures", async () => {
    mockScmConfigDAO.getByProjectId.mockResolvedValue(null);
    mockClankerDAO.listClankers.mockResolvedValue([]);

    const readiness = await new ProjectReadinessService().getReadiness("project-1");

    expect(readiness?.automationAvailable).toBe(false);
    expect(readiness?.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "repository", state: "missing", code: "configure_repository" }),
        expect.objectContaining({ key: "scmCredential", state: "missing", code: "select_scm_credential" }),
        expect.objectContaining({ key: "agentRunner", state: "missing", code: "start_agent_runner" }),
        expect.objectContaining({ key: "agentCredentials", state: "missing", code: "configure_agent_credentials" }),
      ]),
    );
  });

  it("marks an expired SCM credential invalid", async () => {
    mockCredentialDAO.getById.mockResolvedValue({
      integrationId: "scm-1",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    const readiness = await new ProjectReadinessService().getReadiness("project-1");

    expect(readiness?.checks).toContainEqual(
      expect.objectContaining({
        key: "scmCredential",
        state: "invalid",
        code: "replace_expired_scm_credential",
      }),
    );
  });
});
