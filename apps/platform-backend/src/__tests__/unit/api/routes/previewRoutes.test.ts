import express, { type Request } from "express";
import request from "supertest";
import { applicationErrorHandler } from "../../../../api/middleware/notFoundHandling";
import { registerTaskPreviewRoutes } from "../../../../api/routes/tickets/previewRoutes";
import { AppChangeError } from "../../../../services/apps/AppChangeError";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const URL_3 = "https://github.com/acme/laptops/pull/3";
const HEAD = "a".repeat(40);
const PREVIEW = { id: "pv-1", pullRequestUrl: URL_3, commitSha: HEAD, power: "on", state: "building", statusMessage: null, triedCommitSha: null, url: null };

function setup() {
  const previews = { listForTask: jest.fn().mockResolvedValue([PREVIEW]), tryChange: jest.fn().mockResolvedValue(PREVIEW) };
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res, next) => {
    const at = new Date();
    req.authContext = {
      user: { id: "u-1", email: "u@example.com", name: "Ada", avatarUrl: null, role: "member", createdAt: at, updatedAt: at, deactivatedAt: null },
      session: { id: "s", userId: "u-1", tokenHash: "h", createdAt: at, expiresAt: at, revokedAt: null },
      roles: ["member"],
      permissions: [],
    };
    next();
  });
  const tasks = express.Router();
  registerTaskPreviewRoutes(tasks, { previews: () => previews });
  app.use("/api/tasks", tasks);
  app.use(applicationErrorHandler);
  return { app, previews };
}

describe("task preview routes", () => {
  it("lists the task's previews", async () => {
    const { app, previews } = setup();

    const response = await request(app).get(`/api/tasks/${TASK_ID}/previews`).expect(200);

    expect(response.body.data).toEqual([PREVIEW]);
    expect(previews.listForTask).toHaveBeenCalledWith(TASK_ID);
  });

  it("tries the change at the commit the person looked at", async () => {
    const { app, previews } = setup();

    await request(app).post(`/api/tasks/${TASK_ID}/previews`).send({ pullRequestUrl: URL_3, headSha: HEAD }).expect(202);

    expect(previews.tryChange).toHaveBeenCalledWith("u-1", TASK_ID, { pullRequestUrl: URL_3, headSha: HEAD });
  });

  it("needs a full commit, and answers with the reason when the change can't be tried", async () => {
    const { app, previews } = setup();
    await request(app).post(`/api/tasks/${TASK_ID}/previews`).send({ pullRequestUrl: URL_3, headSha: "abc" }).expect(400);

    previews.tryChange.mockRejectedValue(new AppChangeError("NOT_ALLOWED", "Viewers can open a preview, but not start one."));
    const response = await request(app).post(`/api/tasks/${TASK_ID}/previews`).send({ pullRequestUrl: URL_3, headSha: HEAD });

    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).toContain("Viewers can open a preview");
  });
});
