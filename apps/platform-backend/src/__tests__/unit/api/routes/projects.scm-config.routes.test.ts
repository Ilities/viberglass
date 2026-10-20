import express from "express";
import request from "supertest";

const mockProjectDAO = {
  getProject: jest.fn(),
  updateProject: jest.fn(),
};
const mockProjectScmConfigDAO = {
  getByProjectId: jest.fn(),
  upsertByProjectId: jest.fn(),
  deleteByProjectId: jest.fn(),
};
const mockProjectIntegrationLinkDAO = {
  isLinked: jest.fn(),
};
const mockIntegrationDAO = {
  getIntegration: jest.fn(),
};
const mockIntegrationCredentialDAO = {
  getById: jest.fn(),
  getDefaultForIntegration: jest.fn(),
};
const mockSecrets = {
  resolveSecretValue: jest.fn(),
};
jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
  requireRole:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}));

jest.mock("../../../../persistence/project/ProjectDAO", () => ({
  ProjectDAO: jest.fn(() => mockProjectDAO),
}));

jest.mock("../../../../persistence/project/ProjectScmConfigDAO", () => ({
  ProjectScmConfigDAO: jest.fn(() => mockProjectScmConfigDAO),
}));

jest.mock(
  "../../../../persistence/integrations/ProjectIntegrationLinkDAO",
  () => ({
    ProjectIntegrationLinkDAO: jest.fn(() => mockProjectIntegrationLinkDAO),
  }),
);

jest.mock("../../../../persistence/integrations/IntegrationDAO", () => ({
  IntegrationDAO: jest.fn(() => mockIntegrationDAO),
}));

jest.mock("../../../../persistence/integrations/IntegrationCredentialDAO", () => ({
  IntegrationCredentialDAO: jest.fn(() => mockIntegrationCredentialDAO),
}));

jest.mock("../../../../services/SecretResolutionService", () => ({
  SecretResolutionService: jest.fn(() => mockSecrets),
}));

import projectsRouter from "../../../../api/routes/projects";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const INTEGRATION_ID = "22222222-2222-4222-8222-222222222222";

describe("project SCM config routes", () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProjectDAO.updateProject.mockResolvedValue({ id: PROJECT_ID });
    mockIntegrationCredentialDAO.getDefaultForIntegration.mockResolvedValue(null);
    app = express();
    app.use(express.json());
    app.use("/api/spaces", projectsRouter);
  });

  it("refuses repository configuration on Files spaces before checking connections", async () => {
    mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID, backingKind: "files" });
    await request(app).put(`/api/spaces/${PROJECT_ID}/scm-config`).send({ integrationId: INTEGRATION_ID, sourceRepository: "acme/web" }).expect(409);
    expect(mockProjectScmConfigDAO.upsertByProjectId).not.toHaveBeenCalled();
    expect(mockIntegrationDAO.getIntegration).not.toHaveBeenCalled();
  });

  it("returns 404 for GET when project does not exist", async () => {
    mockProjectDAO.getProject.mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/spaces/${PROJECT_ID}/scm-config`)
      .expect(404);

    expect(response.body).toEqual({ error: "Project not found" });
    expect(mockProjectScmConfigDAO.getByProjectId).not.toHaveBeenCalled();
  });

  it("returns 404 for GET when SCM config does not exist", async () => {
    mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID });
    mockProjectScmConfigDAO.getByProjectId.mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/spaces/${PROJECT_ID}/scm-config`)
      .expect(404);

    expect(response.body).toEqual({ error: "SCM configuration not found" });
  });

  it("returns SCM config for GET happy path", async () => {
    const scmConfig = {
      projectId: PROJECT_ID,
      integrationId: INTEGRATION_ID,
      integrationSystem: "github",
      sourceRepository: "https://github.com/acme/repo",
      baseBranch: "main",
      pullRequestRepository: "https://github.com/acme/upstream",
      pullRequestBaseBranch: "develop",
      branchNameTemplate: "viberglass/{{ticketId}}-{{timestamp}}",
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:00.000Z",
    };

    mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID });
    mockProjectScmConfigDAO.getByProjectId.mockResolvedValue(scmConfig);

    const response = await request(app)
      .get(`/api/spaces/${PROJECT_ID}/scm-config`)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: scmConfig,
    });
  });

  it("returns 400 for PUT when payload fails validation", async () => {
    const response = await request(app)
      .put(`/api/spaces/${PROJECT_ID}/scm-config`)
      .send({
        integrationId: INTEGRATION_ID,
      })
      .expect(400);

    expect(response.body.error).toBe("Validation error");
    expect(mockProjectDAO.getProject).not.toHaveBeenCalled();
  });

  it("returns 404 for PUT when project does not exist", async () => {
    mockProjectDAO.getProject.mockResolvedValue(null);

    const response = await request(app)
      .put(`/api/spaces/${PROJECT_ID}/scm-config`)
      .send({
        integrationId: INTEGRATION_ID,
        sourceRepository: "https://github.com/acme/repo",
      })
      .expect(404);

    expect(response.body).toEqual({ error: "Project not found" });
  });

  it("returns 404 for PUT when integration does not exist", async () => {
    mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID });
    mockIntegrationDAO.getIntegration.mockResolvedValue(null);

    const response = await request(app)
      .put(`/api/spaces/${PROJECT_ID}/scm-config`)
      .send({
        integrationId: INTEGRATION_ID,
        sourceRepository: "https://github.com/acme/repo",
      })
      .expect(404);

    expect(response.body).toEqual({ error: "Integration not found" });
  });

  it("returns 400 for PUT when integration category is not SCM", async () => {
    mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID });
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: INTEGRATION_ID,
      system: "jira",
    });

    const response = await request(app)
      .put(`/api/spaces/${PROJECT_ID}/scm-config`)
      .send({
        integrationId: INTEGRATION_ID,
        sourceRepository: "https://github.com/acme/repo",
      })
      .expect(400);

    expect(response.body).toEqual({
      error: "Integration must be an SCM integration",
    });
  });

  it("returns 409 for PUT when integration is not linked to the project", async () => {
    mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID });
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: INTEGRATION_ID,
      system: "github",
    });
    mockProjectIntegrationLinkDAO.isLinked.mockResolvedValue(false);

    const response = await request(app)
      .put(`/api/spaces/${PROJECT_ID}/scm-config`)
      .send({
        integrationId: INTEGRATION_ID,
        sourceRepository: "https://github.com/acme/repo",
      })
      .expect(409);

    expect(response.body).toEqual({
      error: "Integration must be linked to this project before use as SCM",
    });
  });

  it("saves SCM config for PUT happy path with normalized optional fields", async () => {
    const savedConfig = {
      projectId: PROJECT_ID,
      integrationId: INTEGRATION_ID,
      integrationSystem: "github",
      sourceRepository: "https://github.com/acme/repo",
      baseBranch: "main",
      pullRequestRepository: null,
      pullRequestBaseBranch: null,
      branchNameTemplate: null,
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:00.000Z",
    };

    mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID });
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: INTEGRATION_ID,
      system: "github",
    });
    mockProjectIntegrationLinkDAO.isLinked.mockResolvedValue(true);
    mockProjectScmConfigDAO.upsertByProjectId.mockResolvedValue(savedConfig);

    const response = await request(app)
      .put(`/api/spaces/${PROJECT_ID}/scm-config`)
      .send({
        integrationId: INTEGRATION_ID,
        sourceRepository: "  https://github.com/acme/repo  ",
        pullRequestRepository: "",
        pullRequestBaseBranch: "   ",
        branchNameTemplate: "",
      })
      .expect(200);

    expect(mockProjectScmConfigDAO.upsertByProjectId).toHaveBeenCalledWith(
      PROJECT_ID,
      {
        integrationId: INTEGRATION_ID,
        sourceRepository: "https://github.com/acme/repo",
        baseBranch: "main",
        pullRequestRepository: null,
        pullRequestBaseBranch: null,
        branchNameTemplate: null,
        integrationCredentialId: null,
      },
    );
    expect(mockProjectDAO.updateProject).toHaveBeenCalledWith(PROJECT_ID, {
      primaryScmIntegrationId: INTEGRATION_ID,
    });
    expect(response.body).toEqual({
      success: true,
      data: savedConfig,
    });
  });

  it("saves repositories as the host's URL, the way setup does", async () => {
    mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID });
    mockIntegrationDAO.getIntegration.mockResolvedValue({ id: INTEGRATION_ID, system: "github" });
    mockProjectIntegrationLinkDAO.isLinked.mockResolvedValue(true);
    mockProjectScmConfigDAO.upsertByProjectId.mockResolvedValue({});

    await request(app)
      .put(`/api/spaces/${PROJECT_ID}/scm-config`)
      .send({
        integrationId: INTEGRATION_ID,
        sourceRepository: "https://github.com/acme/repo/",
        pullRequestRepository: "acme/upstream.git",
      })
      .expect(200);

    expect(mockProjectScmConfigDAO.upsertByProjectId).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({
        sourceRepository: "https://github.com/acme/repo",
        pullRequestRepository: "https://github.com/acme/upstream",
      }),
    );
  });

  it("returns 422 for PUT when the code host refuses the token runs would use", async () => {
    mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID });
    mockIntegrationDAO.getIntegration.mockResolvedValue({ id: INTEGRATION_ID, system: "github" });
    mockProjectIntegrationLinkDAO.isLinked.mockResolvedValue(true);
    mockIntegrationCredentialDAO.getDefaultForIntegration.mockResolvedValue({ credentialType: "token", secretId: "secret-1" });
    mockSecrets.resolveSecretValue.mockResolvedValue("github_pat_readonly");
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ full_name: "acme/repo", html_url: "https://github.com/acme/repo", default_branch: "main", permissions: { pull: true, push: false } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await request(app)
      .put(`/api/spaces/${PROJECT_ID}/scm-config`)
      .send({ integrationId: INTEGRATION_ID, sourceRepository: "acme/repo" })
      .expect(422);

    expect(fetchSpy.mock.calls[0][0]).toBe("https://api.github.com/repos/acme/repo");
    expect(response.body.error).toEqual(expect.any(String));
    expect(mockProjectScmConfigDAO.upsertByProjectId).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns 400 for PUT when an address on the host isn't a repository", async () => {
    mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID });
    mockIntegrationDAO.getIntegration.mockResolvedValue({ id: INTEGRATION_ID, system: "github" });
    mockProjectIntegrationLinkDAO.isLinked.mockResolvedValue(true);

    for (const sourceRepository of ["https://github.com/acme", "acme", "ftp://example.com/acme/repo"]) {
      await request(app)
        .put(`/api/spaces/${PROJECT_ID}/scm-config`)
        .send({ integrationId: INTEGRATION_ID, sourceRepository })
        .expect(400);
    }

    expect(mockProjectScmConfigDAO.upsertByProjectId).not.toHaveBeenCalled();
  });

  it("saves an address on another server as given, without asking the host about it", async () => {
    mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID });
    mockIntegrationDAO.getIntegration.mockResolvedValue({ id: INTEGRATION_ID, system: "github" });
    mockProjectIntegrationLinkDAO.isLinked.mockResolvedValue(true);
    mockIntegrationCredentialDAO.getDefaultForIntegration.mockResolvedValue({ credentialType: "token", secretId: "secret-1" });
    mockProjectScmConfigDAO.upsertByProjectId.mockResolvedValue({});
    const fetchSpy = jest.spyOn(global, "fetch");

    await request(app)
      .put(`/api/spaces/${PROJECT_ID}/scm-config`)
      .send({ integrationId: INTEGRATION_ID, sourceRepository: " http://git.internal:39101/fixture.git " })
      .expect(200);

    expect(mockProjectScmConfigDAO.upsertByProjectId).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({ sourceRepository: "http://git.internal:39101/fixture.git" }),
    );
    expect(mockSecrets.resolveSecretValue).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns 404 for DELETE when project does not exist", async () => {
    mockProjectDAO.getProject.mockResolvedValue(null);

    const response = await request(app)
      .delete(`/api/spaces/${PROJECT_ID}/scm-config`)
      .expect(404);

    expect(response.body).toEqual({ error: "Project not found" });
    expect(mockProjectScmConfigDAO.deleteByProjectId).not.toHaveBeenCalled();
  });

  it("returns 404 for DELETE when SCM config does not exist", async () => {
    mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID });
    mockProjectScmConfigDAO.deleteByProjectId.mockResolvedValue(false);

    const response = await request(app)
      .delete(`/api/spaces/${PROJECT_ID}/scm-config`)
      .expect(404);

    expect(response.body).toEqual({ error: "SCM configuration not found" });
  });

  it("deletes SCM config for DELETE happy path", async () => {
    mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID });
    mockProjectScmConfigDAO.deleteByProjectId.mockResolvedValue(true);

    await request(app).delete(`/api/spaces/${PROJECT_ID}/scm-config`).expect(204);

    expect(mockProjectScmConfigDAO.deleteByProjectId).toHaveBeenCalledWith(
      PROJECT_ID,
    );
    expect(mockProjectDAO.updateProject).toHaveBeenCalledWith(PROJECT_ID, {
      primaryScmIntegrationId: null,
    });
  });
});
