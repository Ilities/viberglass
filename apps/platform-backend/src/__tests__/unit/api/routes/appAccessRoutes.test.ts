import express, { type Request } from "express";
import request from "supertest";
import { isWorkspaceRole } from "@viberglass/types";
import { applicationErrorHandler } from "../../../../api/middleware/notFoundHandling";
import { spaceParamGuard } from "../../../../api/middleware/spaceAccessGuards";
import { registerAppAccessRoutes } from "../../../../api/routes/appAccessRoutes";
import { SpaceAccessService } from "../../../../services/spaces/SpaceAccessService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const LIST = { people: [], invites: [] };

function setup(membership: "maintainer" | null) {
  const access = new SpaceAccessService({
    projects: {
      getProject: jest.fn().mockResolvedValue({ id: SPACE_ID, isPrivate: false }),
      findByName: jest.fn().mockResolvedValue(null),
    },
    members: { getRole: jest.fn().mockResolvedValue(membership), listVisibleProjectIds: jest.fn().mockResolvedValue([SPACE_ID]) },
  });
  const accessList = {
    list: jest.fn().mockResolvedValue(LIST),
    add: jest.fn().mockResolvedValue({ kind: "invited", list: LIST, invitePath: "/invite/t", emailed: false }),
    remove: jest.fn().mockResolvedValue(LIST),
    cancelInvite: jest.fn().mockResolvedValue(LIST),
  };

  const app = express();
  app.use(express.json());
  app.use((req: Request, _res, next) => {
    const role = req.headers["x-role"];
    if (isWorkspaceRole(role)) {
      const at = new Date();
      req.authContext = {
        user: { id: "u-1", email: "u@example.com", name: "Ada", avatarUrl: null, role, createdAt: at, updatedAt: at, deactivatedAt: null },
        session: { id: "s", userId: "u-1", tokenHash: "h", createdAt: at, expiresAt: at, revokedAt: null },
        roles: [role],
        permissions: [],
      };
    }
    next();
  });
  const spaces = express.Router();
  spaces.param("projectId", spaceParamGuard(access));
  registerAppAccessRoutes(spaces, accessList, access);
  app.use("/api/spaces", spaces);
  app.use(applicationErrorHandler);
  return { app, accessList };
}

describe("an app's access list", () => {
  it("is shown and changed only by the space's maintainers", async () => {
    const { app, accessList } = setup(null);

    await request(app).get(`/api/spaces/${SPACE_ID}/app/access`).set("x-role", "member").expect(403);
    await request(app).post(`/api/spaces/${SPACE_ID}/app/access`).set("x-role", "member").send({ email: "kim@example.com" }).expect(403);
    await request(app).delete(`/api/spaces/${SPACE_ID}/app/access/${USER_ID}`).set("x-role", "member").expect(403);
    expect(accessList.list).not.toHaveBeenCalled();
    expect(accessList.add).not.toHaveBeenCalled();
    expect(accessList.remove).not.toHaveBeenCalled();
  });

  it("lets a maintainer add someone by email, crediting them", async () => {
    const { app, accessList } = setup("maintainer");

    await request(app).get(`/api/spaces/${SPACE_ID}/app/access`).set("x-role", "member").expect(200);
    const response = await request(app).post(`/api/spaces/${SPACE_ID}/app/access`).set("x-role", "member").send({ email: "kim@example.com" }).expect(201);

    expect(response.body.data.invitePath).toBe("/invite/t");
    expect(accessList.add).toHaveBeenCalledWith(SPACE_ID, "kim@example.com", { id: "u-1", name: "Ada" });
  });

  it("asks for an email address", async () => {
    const { app } = setup("maintainer");

    await request(app).post(`/api/spaces/${SPACE_ID}/app/access`).set("x-role", "member").send({ email: "kim" }).expect(400);
  });

  it("takes people and invites off the list", async () => {
    const { app, accessList } = setup("maintainer");

    await request(app).delete(`/api/spaces/${SPACE_ID}/app/access/${USER_ID}`).set("x-role", "member").expect(200);
    await request(app).delete(`/api/spaces/${SPACE_ID}/app/access/invites/${USER_ID}`).set("x-role", "member").expect(200);

    expect(accessList.remove).toHaveBeenCalledWith(SPACE_ID, USER_ID);
    expect(accessList.cancelInvite).toHaveBeenCalledWith(SPACE_ID, USER_ID);
  });
});
