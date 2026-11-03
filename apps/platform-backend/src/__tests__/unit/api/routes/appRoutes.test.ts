import express, { type Request } from "express";
import request from "supertest";
import { isWorkspaceRole } from "@viberglass/types";
import { applicationErrorHandler } from "../../../../api/middleware/notFoundHandling";
import { spaceParamGuard } from "../../../../api/middleware/spaceAccessGuards";
import { registerAppRoutes } from "../../../../api/routes/appRoutes";
import { SpaceAccessService } from "../../../../services/spaces/SpaceAccessService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
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
  };

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
  registerAppRoutes(spaces, apps, access);
  app.use("/api/spaces", spaces);
  app.use(applicationErrorHandler);
  return { app, apps };
}

describe("an App space's app", () => {
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
});
