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

function setup() {
  const deps = {
    sessions: { getLatestClankerIdByTicket: jest.fn().mockResolvedValue(null) },
    clankers: {
      getClanker: jest.fn(async (id: string) => (id === CLAUDE || id === CODEX ? clanker(id) : null)),
      getClankerBySlug: jest.fn().mockResolvedValue(null),
      listClankers: jest.fn().mockResolvedValue([]),
    },
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

    deps.clankers.listClankers.mockResolvedValue([]);
    await expect(resolver.resolve("t", { message: "" })).rejects.toMatchObject({ code: "NO_AGENT", statusCode: 409 });
  });
});
