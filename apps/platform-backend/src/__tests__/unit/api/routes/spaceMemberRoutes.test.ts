import express from "express";
import request from "supertest";
import { isWorkspaceRole, type SpaceMember } from "@viberglass/types";
import { registerSpaceMemberRoutes } from "../../../../api/routes/spaceMemberRoutes";

const SPACE = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const MEMBERS: SpaceMember[] = [
  { userId: USER, name: "Quinn", email: "quinn@example.com", workspaceRole: "member", role: "maintainer", addedAt: "2026-01-01T00:00:00.000Z" },
];

function appFor(role: string) {
  const membership = {
    list: jest.fn(async () => MEMBERS),
    setRole: jest.fn(async () => MEMBERS),
    remove: jest.fn(async () => MEMBERS),
  };
  const router = express.Router();
  // Only the role is read here.
  router.use((req, _res, next) => {
    if (isWorkspaceRole(role)) Object.assign(req, { authContext: { user: { id: "u-1", role } } });
    next();
  });
  registerSpaceMemberRoutes(router, membership);
  const app = express();
  app.use(express.json());
  app.use("/api/spaces", router);
  return app;
}

describe("space member routes", () => {
  it.each(["admin", "member"])("show a %s the members' emails", async (role) => {
    const res = await request(appFor(role)).get(`/api/spaces/${SPACE}/members`).expect(200);
    expect(res.body.data[0].email).toBe("quinn@example.com");
  });

  it.each(["guest", "viewer"])("show a %s names without emails", async (role) => {
    const app = appFor(role);
    const listed = await request(app).get(`/api/spaces/${SPACE}/members`).expect(200);
    expect(listed.body.data[0]).toMatchObject({ name: "Quinn", email: null });
    const changed = await request(app).put(`/api/spaces/${SPACE}/members/${USER}`).send({ role: "member" }).expect(200);
    expect(changed.body.data[0].email).toBeNull();
    const removed = await request(app).delete(`/api/spaces/${SPACE}/members/${USER}`).expect(200);
    expect(removed.body.data[0].email).toBeNull();
  });
});
