import express from "express";
import request from "supertest";
import { currentActorId, withRequestActor } from "../../../../api/auth/requestActor";

async function later() {
  await new Promise((resolve) => setTimeout(resolve, 5));
  return currentActorId();
}

describe("withRequestActor", () => {
  it("makes the signed-in person the actor for everything the request does, across awaits", async () => {
    const app = express();
    app.use((req, _res, next) => {
      if (req.headers["x-user"]) {
        const at = new Date();
        req.authContext = {
          user: { id: String(req.headers["x-user"]), email: "a@example.com", name: "A", avatarUrl: null, role: "member", createdAt: at, updatedAt: at, deactivatedAt: null },
          session: { id: "s", userId: "u", tokenHash: "h", createdAt: at, expiresAt: at, revokedAt: null },
          roles: ["member"],
          permissions: [],
        };
      }
      next();
    });
    app.use(withRequestActor);
    app.get("/", async (_req, res) => res.json({ actor: await later() }));

    expect((await request(app).get("/").set("x-user", "user-7")).body).toEqual({ actor: "user-7" });
    expect((await request(app).get("/")).body).toEqual({ actor: null });
  });
});
