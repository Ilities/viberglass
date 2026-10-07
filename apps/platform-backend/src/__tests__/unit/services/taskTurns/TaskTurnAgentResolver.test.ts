import { agentMentionToken, type Clanker } from "@viberglass/types";
import { TaskTurnAgentResolver } from "../../../../services/taskTurns/TaskTurnAgentResolver";

const CLAUDE = "11111111-1111-4111-8111-111111111111";
const CODEX = "22222222-2222-4222-8222-222222222222";

function clanker(id: string, overrides: Partial<Clanker> = {}): Clanker {
  return {
    id,
    name: id,
    slug: id,
    description: null,
    deploymentStrategyId: "strategy",
    deploymentConfig: null,
    configFiles: [],
    agent: "claude-code",
    secretBindings: [],
    mcpServerIds: [],
    skillIds: [],
    status: "active",
    statusMessage: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function ready(clankers: Clanker[]): Clanker[] {
  return clankers.map((each) => ({
    ...each,
    readiness: each.readiness ?? { state: each.status === "active" ? "ready" : "not_running", problem: each.status === "active" ? null : "Not started.", lastRun: null },
  }));
}

function setup() {
  const deps = {
    readiness: { withReadiness: jest.fn(async (clankers: Clanker[]) => ready(clankers)) },
    sessions: { getLatestClankerIdByTicket: jest.fn().mockResolvedValue(null) },
    clankers: {
      getClanker: jest.fn(async (id: string) => (id === CLAUDE || id === CODEX ? clanker(id) : null)),
      getClankerBySlug: jest.fn().mockResolvedValue(null),
      listClankers: jest.fn().mockResolvedValue([]),
    },
    spaces: { getDefaultAgentIdForTicket: jest.fn().mockResolvedValue(null) },
  };
  return { deps, resolver: new TaskTurnAgentResolver(deps) };
}

describe("TaskTurnAgentResolver", () => {
  it("goes to the agent asked for, then the one mentioned", async () => {
    const { resolver } = setup();

    await expect(resolver.resolve("t", { agentId: CODEX, message: agentMentionToken("Claude", CLAUDE) })).resolves.toBe(CODEX);
    await expect(resolver.resolve("t", { message: `Hi ${agentMentionToken("Claude", CLAUDE)}` })).resolves.toBe(CLAUDE);
  });

  it("refuses an agent that doesn't exist", async () => {
    const { resolver } = setup();

    await expect(resolver.resolve("t", { agentId: "33333333-3333-4333-8333-333333333333", message: "" })).rejects.toMatchObject({
      code: "AGENT_NOT_FOUND",
    });
  });

  it("otherwise stays with the agent already on the task", async () => {
    const { deps, resolver } = setup();
    deps.sessions.getLatestClankerIdByTicket.mockResolvedValue(CODEX);

    await expect(resolver.resolve("t", { message: "@agent go on" })).resolves.toBe(CODEX);
  });

  it("on a new task, uses the workspace's default agent, else the first that can run", async () => {
    const { deps, resolver } = setup();
    deps.clankers.getClankerBySlug.mockResolvedValue(clanker(CLAUDE));
    await expect(resolver.resolve("t", { message: "" })).resolves.toBe(CLAUDE);

    deps.clankers.getClankerBySlug.mockResolvedValue(null);
    deps.clankers.listClankers.mockResolvedValue([clanker("stopped", { status: "inactive" }), clanker(CODEX)]);
    await expect(resolver.resolve("t", { message: "" })).resolves.toBe(CODEX);
    await expect(resolver.preview("t")).resolves.toMatchObject({ clanker: { id: CODEX }, via: "first_ready" });

    deps.clankers.listClankers.mockResolvedValue([]);
    await expect(resolver.resolve("t", { message: "" })).rejects.toMatchObject({ code: "NO_AGENT", statusCode: 409 });
  });

  it("on a new task, prefers the space's default agent to the workspace's", async () => {
    const { deps, resolver } = setup();
    deps.clankers.getClankerBySlug.mockResolvedValue(clanker(CLAUDE));
    deps.spaces.getDefaultAgentIdForTicket.mockResolvedValue(CODEX);

    await expect(resolver.preview("t")).resolves.toMatchObject({ clanker: { id: CODEX }, via: "space_default" });
    expect(deps.spaces.getDefaultAgentIdForTicket).toHaveBeenCalledWith("t");

    // The agent already on the task still comes first.
    deps.sessions.getLatestClankerIdByTicket.mockResolvedValue(CLAUDE);
    await expect(resolver.preview("t")).resolves.toMatchObject({ clanker: { id: CLAUDE }, via: "on_task" });
  });

  it("falls back to the workspace's default while the space's default can't run, and says why if nothing can", async () => {
    const { deps, resolver } = setup();
    const keyless = clanker(CODEX, { name: "Codex", readiness: { state: "needs_key", problem: "No model key.", lastRun: null } });
    deps.spaces.getDefaultAgentIdForTicket.mockResolvedValue(CODEX);
    deps.clankers.getClanker.mockResolvedValue(keyless);
    deps.clankers.getClankerBySlug.mockResolvedValue(clanker(CLAUDE));
    await expect(resolver.preview("t")).resolves.toMatchObject({ clanker: { id: CLAUDE }, via: "default" });

    deps.clankers.getClankerBySlug.mockResolvedValue(null);
    deps.clankers.listClankers.mockResolvedValue([keyless]);
    await expect(resolver.resolve("t", { message: "" })).rejects.toMatchObject({
      code: "NO_AGENT",
      message: expect.stringContaining("Codex: No model key."),
    });
  });

  it("never picks an agent that isn't ready on its own", async () => {
    const { deps, resolver } = setup();
    const keyless = clanker(CLAUDE, { readiness: { state: "needs_key", problem: "No model key.", lastRun: null } });
    deps.clankers.getClankerBySlug.mockResolvedValue(keyless);
    deps.clankers.listClankers.mockResolvedValue([keyless, clanker(CODEX)]);
    await expect(resolver.preview("t")).resolves.toMatchObject({ clanker: { id: CODEX }, via: "first_ready" });

    deps.clankers.listClankers.mockResolvedValue([keyless]);
    await expect(resolver.resolve("t", { message: "" })).rejects.toMatchObject({
      code: "NO_AGENT",
      message: expect.stringContaining("No model key."),
    });
  });

  it("refuses an agent asked for, or already on the task, that has no key", async () => {
    const { deps, resolver } = setup();
    deps.clankers.getClanker.mockResolvedValue(clanker(CODEX, { name: "Codex", readiness: { state: "needs_key", problem: "No model key.", lastRun: null } }));

    await expect(resolver.resolve("t", { agentId: CODEX, message: "" })).rejects.toMatchObject({
      code: "AGENT_NOT_READY",
      message: "Codex can't run yet. No model key.",
    });
    deps.sessions.getLatestClankerIdByTicket.mockResolvedValue(CODEX);
    await expect(resolver.resolve("t", { message: "go on" })).rejects.toMatchObject({ code: "AGENT_NOT_READY" });
  });

  it("still lets a named agent run after its key was rejected, so a fixed key can be tried", async () => {
    const { deps, resolver } = setup();
    deps.clankers.getClanker.mockResolvedValue(
      clanker(CODEX, { readiness: { state: "credential_rejected", problem: "Rejected.", lastRun: null } }),
    );
    await expect(resolver.resolve("t", { agentId: CODEX, message: "" })).resolves.toBe(CODEX);
  });
});
