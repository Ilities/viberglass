import express, { type Request } from "express";
import request from "supertest";
import { isWorkspaceRole } from "@viberglass/types";
import { templateCredentialsGuard } from "../../../../../api/routes/claw/templateCredentialsGuard";

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res, next) => {
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
  a.post("/task-templates", templateCredentialsGuard, (_req, res) => res.json({ ok: true }));
  a.put("/task-templates/:id", templateCredentialsGuard, (_req, res) => res.json({ ok: true }));
  return a;
}

const binding = [{ envVar: "API_KEY", secretId: "11111111-1111-1111-1111-111111111111" }];

describe("templateCredentialsGuard", () => {
  it("lets a member create a template without credentials", async () => {
    await request(app()).post("/task-templates").set("x-role", "member").send({ name: "t", secretBindings: [] }).expect(200);
  });

  it("lets a member edit a template while leaving its credentials alone", async () => {
    await request(app()).put("/task-templates/t-1").set("x-role", "member").send({ name: "renamed" }).expect(200);
  });

  it("refuses a member who binds a secret to a new template", async () => {
    const res = await request(app()).post("/task-templates").set("x-role", "member").send({ secretBindings: binding }).expect(403);
    expect(res.body.error).toBe("Only admins can choose a template's credentials.");
  });

  it("refuses a member who changes a template's credentials, clearing them included", async () => {
    await request(app()).put("/task-templates/t-1").set("x-role", "member").send({ secretBindings: binding }).expect(403);
    await request(app()).put("/task-templates/t-1").set("x-role", "member").send({ secretBindings: [] }).expect(403);
  });

  it("lets an admin choose credentials", async () => {
    await request(app()).post("/task-templates").set("x-role", "admin").send({ secretBindings: binding }).expect(200);
    await request(app()).put("/task-templates/t-1").set("x-role", "admin").send({ secretBindings: [] }).expect(200);
  });
});
