import express from "express";
import request from "supertest";
import { registerRunFilesRoute } from "../../../../api/routes/jobs/runFilesRoute";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));
jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const SAVED = { id: "snap-2", parentId: "snap-1", fileCount: 3, totalBytes: 10, partial: false, changes: { added: 1, changed: 0, removed: 0 }, createdAt: "now" };
const ARTIFACT = { artifactId: "a-1", versionId: "v-1", title: "Weekly report", number: 1, format: "html" };

function setup(saved: typeof SAVED | null) {
  const files = { summaryForJob: jest.fn().mockResolvedValue(saved), artifactsForJob: jest.fn().mockResolvedValue([ARTIFACT]) };
  const app = express();
  const router = express.Router();
  registerRunFilesRoute(router, files);
  app.use("/api/jobs", router);
  return { app, files };
}

describe("a run's Files outcome", () => {
  it("answers with what the run saved and the artifacts it made", async () => {
    const { app } = setup(SAVED);

    const response = await request(app).get("/api/jobs/claw_1/files");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ files: SAVED, artifacts: [ARTIFACT] });
  });

  it("answers with nothing for a run that saved no files", async () => {
    const { app, files } = setup(null);

    const response = await request(app).get("/api/jobs/job_1/files");

    expect(response.body.data).toEqual({ files: null, artifacts: [] });
    expect(files.artifactsForJob).not.toHaveBeenCalled();
  });
});
