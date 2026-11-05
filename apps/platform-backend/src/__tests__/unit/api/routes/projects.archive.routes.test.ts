import express from "express";
import request from "supertest";

const mockProjectDAO = {
  getProject: jest.fn(),
  archiveProject: jest.fn(),
};
const mockProjectDeletionSummaryDAO = {
  summarize: jest.fn(),
};
const mockSchedulingEngine = {
  triggerRefresh: jest.fn(),
};
const mockAppService = {
  turnOffForArchive: jest.fn(),
};
const mockSpaceDeletion = {
  delete: jest.fn(),
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
jest.mock("../../../../persistence/project/ProjectDeletionSummaryDAO", () => ({
  ProjectDeletionSummaryDAO: jest.fn(() => mockProjectDeletionSummaryDAO),
}));
jest.mock("../../../../services/claw/ClawSchedulingEngine", () => ({
  ClawSchedulingEngine: { getInstance: () => mockSchedulingEngine },
}));

jest.mock("../../../../services/apps/createAppHosting", () => ({
  appHosting: () => ({ service: mockAppService, rollbacks: {}, host: () => null }),
}));
jest.mock("../../../../services/spaces/createSpaceDeletionService", () => ({
  createSpaceDeletionService: () => mockSpaceDeletion,
}));

import projectsRouter from "../../../../api/routes/projects";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

describe("project archive and deletion summary routes", () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use("/api/spaces", projectsRouter);
  });

  describe("POST /:id/archive", () => {
    it("archives the project, stops its schedules and returns it", async () => {
      mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID });
      mockProjectDAO.archiveProject.mockResolvedValue({
        id: PROJECT_ID,
        archivedAt: "2026-09-23T09:00:00.000Z",
      });

      const response = await request(app)
        .post(`/api/spaces/${PROJECT_ID}/archive`)
        .expect(200);

      expect(mockProjectDAO.archiveProject).toHaveBeenCalledWith(PROJECT_ID);
      expect(mockSchedulingEngine.triggerRefresh).toHaveBeenCalled();
      expect(mockAppService.turnOffForArchive).not.toHaveBeenCalled();
      expect(response.body).toEqual({
        success: true,
        data: { id: PROJECT_ID, archivedAt: "2026-09-23T09:00:00.000Z" },
      });
    });

    it("turns an App space's app off for good", async () => {
      mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID, backingKind: "app" });
      mockProjectDAO.archiveProject.mockResolvedValue({ id: PROJECT_ID });

      await request(app).post(`/api/spaces/${PROJECT_ID}/archive`).expect(200);

      expect(mockAppService.turnOffForArchive).toHaveBeenCalledWith(PROJECT_ID);
    });

    it("returns 404 for an unknown project", async () => {
      mockProjectDAO.getProject.mockResolvedValue(null);

      await request(app).post(`/api/spaces/${PROJECT_ID}/archive`).expect(404);

      expect(mockProjectDAO.archiveProject).not.toHaveBeenCalled();
    });
  });

  describe("GET /:id/deletion-summary", () => {
    it("returns what deleting the project would also delete", async () => {
      mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID });
      mockProjectDeletionSummaryDAO.summarize.mockResolvedValue({
        tickets: 4,
        runs: 7,
        sessions: 3,
        schedules: 1,
        app: null,
      });

      const response = await request(app)
        .get(`/api/spaces/${PROJECT_ID}/deletion-summary`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { tickets: 4, runs: 7, sessions: 3, schedules: 1, app: null },
      });
    });

    it("returns 404 for an unknown project", async () => {
      mockProjectDAO.getProject.mockResolvedValue(null);

      await request(app)
        .get(`/api/spaces/${PROJECT_ID}/deletion-summary`)
        .expect(404);

      expect(mockProjectDeletionSummaryDAO.summarize).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /:id", () => {
    it("deletes the space and passes on what couldn't be done", async () => {
      mockSpaceDeletion.delete.mockResolvedValue({ warnings: ["The repository acme/laptops wasn't archived."] });

      const response = await request(app).delete(`/api/spaces/${PROJECT_ID}`).expect(200);

      expect(mockSpaceDeletion.delete).toHaveBeenCalledWith(PROJECT_ID);
      expect(response.body).toEqual({ success: true, data: { warnings: ["The repository acme/laptops wasn't archived."] } });
    });

    it("returns 404 for an unknown project", async () => {
      mockSpaceDeletion.delete.mockResolvedValue(null);

      await request(app).delete(`/api/spaces/${PROJECT_ID}`).expect(404);
    });
  });
});
