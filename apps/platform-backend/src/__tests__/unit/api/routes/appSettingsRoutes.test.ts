import express, { type Request } from "express";
import request from "supertest";
import { isWorkspaceRole } from "@viberglass/types";
import { applicationErrorHandler } from "../../../../api/middleware/notFoundHandling";
import { spaceParamGuard } from "../../../../api/middleware/spaceAccessGuards";
import { registerAppSettingsRoutes } from "../../../../api/routes/appSettingsRoutes";
import { SpaceAccessService } from "../../../../services/spaces/SpaceAccessService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const VIEW = { settings: [], declared: [{ name: "SLACK_TOKEN", secret: true }], missing: ["SLACK_TOKEN"] };

function setup() {
  const access = new SpaceAccessService({
    projects: {
      getProject: jest.fn().mockResolvedValue({ id: SPACE_ID, isPrivate: false }),
      findByName: jest.fn().mockResolvedValue(null),
    },
    // Not a member of the space, nor its maintainer: an open space anyone in the workspace sees.
    members: { getRole: jest.fn().mockResolvedValue(null), listVisibleProjectIds: jest.fn().mockResolvedValue([SPACE_ID]) },
  });
  const settings = {
    view: jest.fn().mockResolvedValue(VIEW),
    save: jest.fn().mockResolvedValue(VIEW),
    remove: jest.fn().mockResolvedValue(VIEW),
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
  // As on the real spaces router, where a `:name` parameter names a space.
  spaces.param("projectId", spaceParamGuard(access));
  spaces.param("name", spaceParamGuard(access));
  registerAppSettingsRoutes(spaces, settings, access);
  app.use("/api/spaces", spaces);
  app.use(applicationErrorHandler);
  return { app, settings };
}

describe("an app's settings", () => {
  it("are only shown to maintainers", async () => {
    const { app, settings } = setup();

    await request(app).get(`/api/spaces/${SPACE_ID}/app/settings`).set("x-role", "member").expect(403);
    const response = await request(app).get(`/api/spaces/${SPACE_ID}/app/settings`).set("x-role", "admin").expect(200);
    expect(response.body.data).toEqual(VIEW);
    expect(settings.view).toHaveBeenCalledTimes(1);
  });

  it("are set and removed by maintainers only", async () => {
    const { app, settings } = setup();
    const url = `/api/spaces/${SPACE_ID}/app/settings/SLACK_TOKEN`;

    await request(app).put(url).set("x-role", "member").send({ secret: true, value: "xoxb" }).expect(403);
    await request(app).delete(url).set("x-role", "member").expect(403);
    await request(app).put(url).set("x-role", "admin").send({ secret: true, value: "xoxb", forPreviews: true }).expect(200);
    await request(app).delete(url).set("x-role", "admin").expect(200);

    expect(settings.save.mock.calls).toEqual([[SPACE_ID, "SLACK_TOKEN", { secret: true, value: "xoxb", forPreviews: true }, "u-1"]]);
    expect(settings.remove.mock.calls).toEqual([[SPACE_ID, "SLACK_TOKEN"]]);
  });

  it("refuses a body that doesn't say whether the setting is secret", async () => {
    const { app, settings } = setup();

    await request(app).put(`/api/spaces/${SPACE_ID}/app/settings/X`).set("x-role", "admin").send({ value: 3 }).expect(400);
    expect(settings.save).not.toHaveBeenCalled();
  });
});
