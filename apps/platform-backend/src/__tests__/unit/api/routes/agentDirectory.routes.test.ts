import express from "express";
import request from "supertest";
import type { Clanker } from "@viberglass/types";
import { createAgentDirectoryRouter } from "../../../../api/routes/agentDirectory";

const RUNNER: Clanker = {
  id: "c-1",
  name: "Claude",
  slug: "claude",
  deploymentStrategyId: "docker",
  deploymentConfig: { strategy: { type: "docker" }, token: "secret-config" },
  configFiles: [{ id: "f-1", clankerId: "c-1", fileType: "AGENTS.md", content: "private instructions", createdAt: "", updatedAt: "" }],
  agent: "claude-code",
  secretBindings: [{ envVar: "ANTHROPIC_API_KEY", secretId: "s-1" }],
  mcpServerIds: ["m-1"],
  skillIds: ["k-1"],
  modelEndpoint: { endpointId: "e-1", model: "claude-sonnet" },
  status: "active",
  readiness: { state: "ready", problem: null, lastRun: null },
  createdAt: "",
  updatedAt: "",
};

describe("agent directory route", () => {
  it("lists what each agent is and whether it runs, without its configuration", async () => {
    const app = express();
    app.use("/api/agents", createAgentDirectoryRouter({ list: jest.fn(async () => [RUNNER]) }));
    const res = await request(app).get("/api/agents").expect(200);
    expect(res.body.data).toEqual([
      {
        id: "c-1",
        name: "Claude",
        slug: "claude",
        agent: "claude-code",
        model: "claude-sonnet",
        status: "active",
        readiness: { state: "ready", problem: null, lastRun: null },
        deployable: true,
      },
    ]);
  });
});
