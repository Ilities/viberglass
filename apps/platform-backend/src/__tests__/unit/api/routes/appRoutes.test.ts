import express, { type Request } from "express";
import request from "supertest";
import { isWorkspaceRole } from "@viberglass/types";
import { applicationErrorHandler } from "../../../../api/middleware/notFoundHandling";
import { spaceParamGuard } from "../../../../api/middleware/spaceAccessGuards";
import { registerAppRoutes } from "../../../../api/routes/appRoutes";
import { SpaceAccessService } from "../../../../services/spaces/SpaceAccessService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const RELEASE_ID = "22222222-2222-4222-8222-222222222222";
const VIEW = { power: "on", state: "running", statusMessage: null, currentRelease: null, releases: [] };

function setup() {
  const access = new SpaceAccessService({
    projects: {
      getProject: jest.fn().mockResolvedValue({ id: SPACE_ID, isPrivate: false }),
      findByName: jest.fn().mockResolvedValue(null),
    },
    // Not a member of the space, nor its maintainer: an open space anyone in the workspace sees.
    members: { getRole: jest.fn().mockResolvedValue(null), listVisibleProjectIds: jest.fn().mockResolvedValue([SPACE_ID]) },
  });
  const apps = {
    view: jest.fn().mockResolvedValue(VIEW),
    setPower: jest.fn().mockResolvedValue({ ...VIEW, power: "off" }),
    logs: jest.fn().mockResolvedValue("listening\n"),
    buildLog: jest.fn().mockResolvedValue({ buildLog: "npm run build\n" }),
  };
  const rollbacks = { restore: jest.fn().mockResolvedValue(undefined) };
  const backups = { list: jest.fn().mockResolvedValue([]), requestBackup: jest.fn().mockResolvedValue(undefined) };

  const app = express();
  app.use(express.json());
  app.use((req: Request, _res, next) => {
    const role = req.headers["x-role"];
    if (isWorkspaceRole(role)) {
      const at = new Date();
      req.authContext = {
        user: { id: "u-1", email: "u@example.com", name: "U", avatarUrl: null, role, createdAt: at, updatedAt: at, deactivatedAt: null },
        session: { id: "s", userId: "u-1", tokenHash: "h", createdAt: at, expiresAt: at, revokedAt: null },
        roles: [role],
        permissions: [],
      };
    }
    next();
  });
  const spaces = express.Router();
  spaces.param("projectId", spaceParamGuard(access));
  registerAppRoutes(spaces, apps, access, rollbacks, backups);
  app.use("/api/spaces", spaces);
  app.use(applicationErrorHandler);
  return { app, apps, rollbacks, backups };
}

describe("an App space's app", () => {
  it("gives a release's build log to anyone who sees the space, and 404 for another app's release", async () => {
    const { app, apps } = setup();

    const response = await request(app).get(`/api/spaces/${SPACE_ID}/app/releases/${RELEASE_ID}/build-log`).set("x-role", "member").expect(200);
    expect(response.body.data).toEqual({ buildLog: "npm run build\n" });
    expect(apps.buildLog).toHaveBeenCalledWith(SPACE_ID, RELEASE_ID);

    apps.buildLog.mockResolvedValueOnce(null);
    await request(app).get(`/api/spaces/${SPACE_ID}/app/releases/${RELEASE_ID}/build-log`).set("x-role", "member").expect(404);
  });

  it("is shown to anyone who sees the space", async () => {
    const { app } = setup();

    const response = await request(app).get(`/api/spaces/${SPACE_ID}/app`).set("x-role", "member").expect(200);
    expect(response.body.data).toEqual(VIEW);
  });

  it("is turned on or off by a maintainer, answering before it has started or stopped", async () => {
    const { app, apps } = setup();

    await request(app).post(`/api/spaces/${SPACE_ID}/app/off`).set("x-role", "admin").expect(202);
    await request(app).post(`/api/spaces/${SPACE_ID}/app/on`).set("x-role", "admin").expect(202);
    expect(apps.setPower.mock.calls).toEqual([[SPACE_ID, "off"], [SPACE_ID, "on"]]);
  });

  it("can't be turned on or off, or have its logs read, by someone who isn't a maintainer", async () => {
    const { app, apps } = setup();

    await request(app).post(`/api/spaces/${SPACE_ID}/app/off`).set("x-role", "member").expect(403);
    await request(app).get(`/api/spaces/${SPACE_ID}/app/logs`).set("x-role", "member").expect(403);
    expect(apps.setPower).not.toHaveBeenCalled();
    expect(apps.logs).not.toHaveBeenCalled();
  });

  it("shows its logs to a maintainer", async () => {
    const { app } = setup();

    const response = await request(app).get(`/api/spaces/${SPACE_ID}/app/logs`).set("x-role", "admin").expect(200);
    expect(response.body.data).toEqual({ logs: "listening\n" });
  });

  it("is rolled back by a maintainer, who says whether the data goes back too", async () => {
    const { app, rollbacks } = setup();
    const restore = `/api/spaces/${SPACE_ID}/app/releases/${RELEASE_ID}/restore`;

    await request(app).post(restore).set("x-role", "member").send({ withData: true }).expect(403);
    await request(app).post(restore).set("x-role", "admin").send({}).expect(400);
    const response = await request(app).post(restore).set("x-role", "admin").send({ withData: true }).expect(202);

    expect(response.body.data).toEqual(VIEW);
    expect(rollbacks.restore.mock.calls).toEqual([[SPACE_ID, RELEASE_ID, { withData: true }, "u-1"]]);
  });
});

describe("an app's data backups", () => {
  it("are listed to anyone who sees the space", async () => {
    const { app, backups } = setup();

    await request(app).get(`/api/spaces/${SPACE_ID}/app/backups`).set("x-role", "member").expect(200);
    expect(backups.list).toHaveBeenCalledWith(SPACE_ID);
  });

  it("are taken on request by a maintainer only", async () => {
    const { app, backups } = setup();

    await request(app).post(`/api/spaces/${SPACE_ID}/app/backups`).set("x-role", "member").expect(403);
    expect(backups.requestBackup).not.toHaveBeenCalled();
    await request(app).post(`/api/spaces/${SPACE_ID}/app/backups`).set("x-role", "admin").expect(202);
    expect(backups.requestBackup).toHaveBeenCalledWith(SPACE_ID);
  });
});
