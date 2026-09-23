import express from "express";
import request from "supertest";

const mockProjectDAO = {
  getProject: jest.fn(),
  archiveProject: jest.fn(),
};
const mockProjectDeletionSummaryDAO = {
  summarize: jest.fn(),
};

jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));
jest.mock("../../../../persistence/project/ProjectDAO", () => ({
  ProjectDAO: jest.fn(() => mockProjectDAO),
}));
jest.mock("../../../../persistence/project/ProjectDeletionSummaryDAO", () => ({
  ProjectDeletionSummaryDAO: jest.fn(() => mockProjectDeletionSummaryDAO),
}));

import projectsRouter from "../../../../api/routes/projects";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

describe("project archive and deletion summary routes", () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use("/api/projects", projectsRouter);
  });

  describe("POST /:id/archive", () => {
    it("archives the project and returns it", async () => {
      mockProjectDAO.getProject.mockResolvedValue({ id: PROJECT_ID });
      mockProjectDAO.archiveProject.mockResolvedValue({
        id: PROJECT_ID,
        archivedAt: "2026-09-23T09:00:00.000Z",
      });

      const response = await request(app)
        .post(`/api/projects/${PROJECT_ID}/archive`)
        .expect(200);

      expect(mockProjectDAO.archiveProject).toHaveBeenCalledWith(PROJECT_ID);
      expect(response.body).toEqual({
        success: true,
        data: { id: PROJECT_ID, archivedAt: "2026-09-23T09:00:00.000Z" },
      });
    });

    it("returns 404 for an unknown project", async () => {
      mockProjectDAO.getProject.mockResolvedValue(null);

      await request(app).post(`/api/projects/${PROJECT_ID}/archive`).expect(404);

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
      });

      const response = await request(app)
        .get(`/api/projects/${PROJECT_ID}/deletion-summary`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { tickets: 4, runs: 7, sessions: 3, schedules: 1 },
      });
    });

    it("returns 404 for an unknown project", async () => {
      mockProjectDAO.getProject.mockResolvedValue(null);

      await request(app)
        .get(`/api/projects/${PROJECT_ID}/deletion-summary`)
        .expect(404);

      expect(mockProjectDeletionSummaryDAO.summarize).not.toHaveBeenCalled();
    });
  });
});
