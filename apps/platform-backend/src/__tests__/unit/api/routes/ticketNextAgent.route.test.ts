import express from "express";
import request from "supertest";
import { registerTicketAgentSessionRoutes } from "../../../../api/routes/tickets/agentSessionRoutes";
import { TASK_TURN_ERROR_CODE, TaskTurnError } from "../../../../services/errors/TaskTurnError";

function app(preview: jest.Mock) {
  const server = express();
  const router = express.Router();
  registerTicketAgentSessionRoutes(router, {
    turns: { ask: jest.fn() },
    queryService: { listForTicket: jest.fn() },
    agents: { preview },
  });
  server.use("/api/tasks", router);
  return server;
}

describe("GET /api/tasks/:id/next-agent", () => {
  it("names the agent the next ask goes to, and how it was picked", async () => {
    const preview = jest.fn().mockResolvedValue({ clanker: { id: "c-1", readiness: { problem: null } }, via: "on_task" });

    const response = await request(app(preview)).get("/api/tasks/t-1/next-agent");

    expect(preview).toHaveBeenCalledWith("t-1");
    expect(response.body.data).toEqual({ clankerId: "c-1", via: "on_task", problem: null });
  });

  it("says why no agent would run instead of failing", async () => {
    const preview = jest.fn().mockRejectedValue(new TaskTurnError(TASK_TURN_ERROR_CODE.NO_AGENT, "No agent is ready to run."));

    const response = await request(app(preview)).get("/api/tasks/t-1/next-agent");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ clankerId: null, via: null, problem: "No agent is ready to run." });
  });
});
