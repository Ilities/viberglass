const mockProjectDAO = { getProject: jest.fn() };
const mockScmConfigDAO = { getByProjectId: jest.fn() };
const mockCredentialDAO = { getById: jest.fn() };
const mockClankerDAO = { listClankers: jest.fn() };
const mockSecretDAO = { getSecret: jest.fn() };
const mockDemo = { getDemo: jest.fn() };
const mockTicketDAO = { projectHasRuns: jest.fn() };

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
jest.mock("../../../persistence/secret/SecretDAO", () => ({
  SecretDAO: jest.fn(() => mockSecretDAO),
}));
jest.mock("../../../persistence/ticketing/TicketDAO", () => ({
  TicketDAO: jest.fn(() => mockTicketDAO),
}));
jest.mock("../../../services/demo/DemoWorkspaceService", () => ({
  DemoWorkspaceService: jest.fn(() => mockDemo),
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
    mockClankerDAO.listClankers.mockResolvedValue([runner({ status: "active" })]);
    mockSecretDAO.getSecret.mockImplementation(async (id: string) => (id === "secret-1" ? { id } : null));
    mockDemo.getDemo.mockResolvedValue(null);
    mockTicketDAO.projectHasRuns.mockResolvedValue(false);
  });

  it("says whether the space has run anything yet", async () => {
    expect((await new ProjectReadinessService().getReadiness("project-1"))?.hasRuns).toBe(false);

    mockTicketDAO.projectHasRuns.mockResolvedValue(true);
    expect((await new ProjectReadinessService().getReadiness("project-1"))?.hasRuns).toBe(true);
  });

  it("calls the demo space sample data instead of listing setup to do", async () => {
    mockDemo.getDemo.mockResolvedValue({ projectId: "project-1", name: "Demo", slug: "demo" });

    const readiness = await new ProjectReadinessService().getReadiness("project-1");

    expect(readiness).toEqual({
      projectId: "project-1",
      automationAvailable: false,
      hasRuns: true,
      checks: [expect.objectContaining({ key: "demo", state: "unavailable", remediationUrl: "/setup" })],
    });
  });

  function runner(overrides: Record<string, unknown>) {
    return {
      name: "Default agent",
      slug: "default-agent",
      status: "inactive",
      statusMessage: null,
      deploymentStrategyId: "strategy-1",
      secretIds: ["secret-1"],
      ...overrides,
    };
  }

  function check(readiness: Awaited<ReturnType<ProjectReadinessService["getReadiness"]>>, key: string) {
    return readiness?.checks.find((c) => c.key === key);
  }

  it("lists the checks in the order setup asks for them", async () => {
    const readiness = await new ProjectReadinessService().getReadiness("project-1");

    expect(readiness?.checks.map((c) => c.key)).toEqual([
      "agentCredentials",
      "repository",
      "scmCredential",
      "agentRunner",
    ]);
  });

  it("asks to start a stopped agent that has a key, not for another key (FR8)", async () => {
    mockClankerDAO.listClankers.mockResolvedValue([runner({ status: "inactive" })]);

    const readiness = await new ProjectReadinessService().getReadiness("project-1");

    expect(check(readiness, "agentCredentials")?.state).toBe("ready");
    expect(check(readiness, "agentRunner")).toMatchObject({
      state: "unavailable",
      summary: "Default agent isn't started. Start it to run tasks.",
      remediationUrl: "/clankers/default-agent",
    });
  });

  it("doesn't count a key whose secret is gone", async () => {
    mockClankerDAO.listClankers.mockResolvedValue([runner({ status: "active", secretIds: ["deleted"] })]);

    const readiness = await new ProjectReadinessService().getReadiness("project-1");

    expect(check(readiness, "agentCredentials")).toMatchObject({ state: "missing", remediationUrl: "/setup" });
  });

  it("says why the agent failed to start", async () => {
    mockClankerDAO.listClankers.mockResolvedValue([
      runner({ status: "failed", statusMessage: "Docker image x couldn't be pulled" }),
    ]);

    const readiness = await new ProjectReadinessService().getReadiness("project-1");

    expect(check(readiness, "agentRunner")?.summary).toBe(
      "Default agent failed to start: Docker image x couldn't be pulled",
    );
  });

  it("sends a workspace without agents to setup", async () => {
    mockClankerDAO.listClankers.mockResolvedValue([]);

    const readiness = await new ProjectReadinessService().getReadiness("project-1");

    expect(check(readiness, "agentRunner")).toMatchObject({ state: "missing", remediationUrl: "/setup" });
    expect(check(readiness, "agentCredentials")).toMatchObject({ state: "missing", remediationUrl: "/setup" });
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
