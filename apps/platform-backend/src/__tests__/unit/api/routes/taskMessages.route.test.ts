import express from "express";
import request from "supertest";
import { registerTaskDiscussionRoutes } from "../../../../api/routes/tickets/discussionRoutes";

const TASK = "11111111-1111-4111-8111-111111111111";

function app() {
  const turns = {
    ask: jest.fn().mockResolvedValue({ session: { id: "s-1" }, currentTurn: { id: "turn-1" }, job: { id: "job-1", status: "pending" }, messageId: "m-1" }),
  };
  const discussion = { post: jest.fn(), list: jest.fn().mockResolvedValue([]) };
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    const at = new Date();
    req.authContext = {
      user: { id: "u-1", email: "maria@example.com", name: "Maria", avatarUrl: null, role: "member", createdAt: at, updatedAt: at, deactivatedAt: null },
      session: { id: "s", userId: "u-1", tokenHash: "h", createdAt: at, expiresAt: at, revokedAt: null },
      roles: ["member"],
      permissions: [],
    };
    next();
  });
  const router = express.Router();
  registerTaskDiscussionRoutes(router, { discussion, timeline: { list: jest.fn() }, turns, mentions: { markDone: jest.fn() } });
  server.use("/api/tasks", router);
  return { server, turns };
}

describe("POST /api/tasks/:id/messages with the parts of a build", () => {
  it("asks for a build of the parts named", async () => {
    const { server, turns } = app();

    const response = await request(server).post(`/api/tasks/${TASK}/messages`).send({ body: "", action: "code", parts: { first: 2, last: 2 } });

    expect(response.status).toBe(201);
    expect(turns.ask).toHaveBeenCalledWith(TASK, "u-1", { message: "", action: "code", agentId: undefined, parts: { first: 2, last: 2 } });
  });

  it.each([
    ["a range that runs backwards", { action: "code", parts: { first: 3, last: 2 } }],
    ["a part numbered 0", { action: "code", parts: { first: 0, last: null } }],
    ["a range without its end", { action: "code", parts: { first: 2 } }],
    ["parts on an ask that isn't a build", { action: "plan", parts: { first: 1, last: 1 } }],
  ])("refuses %s", async (_label, body) => {
    const { server, turns } = app();

    const response = await request(server).post(`/api/tasks/${TASK}/messages`).send({ body: "", ...body });

    expect(response.status).toBe(400);
    expect(turns.ask).not.toHaveBeenCalled();
  });
});
