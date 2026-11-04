import express, { type Request } from "express";
import request from "supertest";
import { applicationErrorHandler } from "../../../../api/middleware/notFoundHandling";
import { registerTaskMakeLiveRoutes } from "../../../../api/routes/tickets/makeLiveRoutes";
import { MakeLiveError } from "../../../../services/apps/MakeLiveError";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const URL_3 = "https://github.com/acme/laptops/pull/3";
const HEAD = "a".repeat(40);

function setup() {
  const makeLive = { makeLive: jest.fn().mockResolvedValue("b".repeat(40)) };
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
  registerTaskMakeLiveRoutes(tasks, { makeLive });
  app.use("/api/tasks", tasks);
  app.use(applicationErrorHandler);
  return { app, makeLive };
}

describe("POST /api/tasks/:id/make-live", () => {
  it("makes the change live as the signed-in person", async () => {
    const { app, makeLive } = setup();

    const response = await request(app).post(`/api/tasks/${TASK_ID}/make-live`).send({ pullRequestUrl: URL_3, headSha: HEAD });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ commitSha: "b".repeat(40) });
    expect(makeLive.makeLive).toHaveBeenCalledWith("u-1", TASK_ID, { pullRequestUrl: URL_3, headSha: HEAD });
  });

  it("needs the change and the full commit the person looked at", async () => {
    const { app, makeLive } = setup();

    await request(app).post(`/api/tasks/${TASK_ID}/make-live`).send({ headSha: HEAD }).expect(400);
    await request(app).post(`/api/tasks/${TASK_ID}/make-live`).send({ pullRequestUrl: URL_3, headSha: "abc123" }).expect(400);
    expect(makeLive.makeLive).not.toHaveBeenCalled();
  });

  it("answers with the reason when the change can't be made live", async () => {
    const { app, makeLive } = setup();
    makeLive.makeLive.mockRejectedValue(new MakeLiveError("HEAD_MOVED", "The change got new commits since you looked at it."));

    const response = await request(app).post(`/api/tasks/${TASK_ID}/make-live`).send({ pullRequestUrl: URL_3, headSha: HEAD });

    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).toContain("The change got new commits since you looked at it.");
  });
});
