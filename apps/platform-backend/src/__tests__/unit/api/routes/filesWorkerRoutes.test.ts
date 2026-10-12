import express from "express";
import request from "supertest";
import { registerFilesWorkerRoutes } from "../../../../api/routes/jobs/filesWorkerRoutes";
import { SpaceFilesConflict, type SpaceFilesRunService } from "../../../../services/spaceFiles/SpaceFilesRunService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));
jest.mock("../../../../api/middleware/callbackTokenValidation", () => ({
  validateCallbackToken: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock("../../../../api/middleware/tenantValidation", () => ({
  tenantMiddleware: (req: { tenantId?: string }, _res: unknown, next: () => void) => {
    req.tenantId = "api-server";
    next();
  },
}));

const SHA = "a".repeat(64);

function setup() {
  const files = { grant: jest.fn(), checkpoint: jest.fn().mockResolvedValue({ id: "snap-1", artifacts: [], artifactError: null }) };
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registerFilesWorkerRoutes(router, files as unknown as SpaceFilesRunService);
  app.use("/api/jobs", router);
  return { app, files };
}

describe("the Files checkpoint callback", () => {
  it("passes the agent's artifact declaration on with the archive it saved", async () => {
    const { app, files } = setup();
    const manifest = { artifacts: [{ title: "Deck", entrypoint: "deck/index.html" }] };

    const response = await request(app).post("/api/jobs/job-1/files/checkpoint").send({ sha256: SHA, archiveBytes: 10, partial: false, artifactManifest: manifest });

    expect(response.status).toBe(200);
    expect(files.checkpoint).toHaveBeenCalledWith("job-1", "api-server", { sha256: SHA, archiveBytes: 10, partial: false, artifactManifest: manifest });
  });

  it("passes on why the declaration couldn't be read", async () => {
    const { app, files } = setup();
    await request(app).post("/api/jobs/job-1/files/checkpoint").send({ sha256: SHA, archiveBytes: 10, partial: false, artifactManifestError: "not JSON" });
    expect(files.checkpoint).toHaveBeenCalledWith("job-1", "api-server", expect.objectContaining({ artifactManifest: null, artifactManifestError: "not JSON" }));
  });

  it("refuses a malformed request and reports a conflict as 409", async () => {
    const { app, files } = setup();
    expect((await request(app).post("/api/jobs/job-1/files/checkpoint").send({ sha256: "nope", archiveBytes: 10, partial: false })).status).toBe(400);
    files.checkpoint.mockRejectedValue(new SpaceFilesConflict("moved on"));
    expect((await request(app).post("/api/jobs/job-1/files/checkpoint").send({ sha256: SHA, archiveBytes: 10, partial: false })).status).toBe(409);
  });
});
