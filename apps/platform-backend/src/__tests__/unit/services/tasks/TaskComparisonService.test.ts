import type { Ticket } from "@viberglass/types";
import { TaskComparisonService } from "../../../../services/tasks/TaskComparisonService";

const PARENT: Ticket = {
  id: "task-1",
  key: "WEB-1",
  projectId: "web",
  timestamp: "2026-10-06T10:00:00Z",
  title: "Gift notes",
  description: "Let customers add a note.",
  severity: "medium",
  category: "General",
  status: "open",
  workflowPhase: "planning",
  metadata: { timestamp: "2026-10-06T10:00:00Z", timezone: "UTC" },
  annotations: [],
  ticketSystem: "native",
  autoFixRequested: false,
  createdAt: "2026-10-06T10:00:00Z",
  updatedAt: "2026-10-06T10:00:00Z",
};

const FINISHED_AT = new Date("2026-10-20T10:00:00Z");

function setup() {
  let forks = 0;
  const deps = {
    tickets: { getTicket: jest.fn().mockResolvedValue(PARENT) },
    execution: { backingOf: jest.fn().mockResolvedValue("git") },
    policy: { assertCanAsk: jest.fn().mockResolvedValue(undefined) },
    agents: { resolve: jest.fn(async (_task: string, request: { agentId?: string }) => request.agentId ?? "") },
    clankers: { getClanker: jest.fn(async (id: string) => ({ id, name: id === "claude" ? "Claude Code" : "OpenCode" })) },
    comparisons: {
      create: jest.fn().mockResolvedValue("cmp-1"),
      addArm: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue({ id: "cmp-1", parentTicketId: "task-1" }),
      listArms: jest.fn().mockResolvedValue([{ ticketId: "task-2", key: "WEB-2", runner: { name: "Claude Code" } }]),
      setWinner: jest.fn().mockResolvedValue(undefined),
    },
    forkPoints: {
      turnFinishedAt: jest.fn().mockResolvedValue(FINISHED_AT),
      lastCommitBy: jest.fn().mockResolvedValue({ branch: "viberglass/task-1", commit: "abc123" }),
    },
    branches: { get: jest.fn().mockResolvedValue("viberglass/task-1") },
    forks: { fork: jest.fn(async (): Promise<Ticket> => ({ ...PARENT, id: `task-${(forks += 1) + 1}`, key: `WEB-${forks + 1}` })) },
    turns: { ask: jest.fn().mockResolvedValue({}) },
    discussion: { create: jest.fn().mockResolvedValue("message-1") },
  };
  return { deps, service: new TaskComparisonService(deps) };
}

describe("TaskComparisonService.start", () => {
  it("forks the task once per runner and sends each fork the same ask with its runner", async () => {
    const { deps, service } = setup();

    await expect(service.start("task-1", "user-1", { agentIds: ["claude", "opencode"], message: "Build it", action: "code" })).resolves.toBe("cmp-1");

    expect(deps.forks.fork).toHaveBeenCalledWith(PARENT, expect.any(Date), "Gift notes · Claude Code", "user-1");
    expect(deps.forks.fork).toHaveBeenCalledWith(PARENT, expect.any(Date), "Gift notes · OpenCode", "user-1");
    expect(deps.comparisons.addArm).toHaveBeenCalledWith("cmp-1", "task-2", "claude", 0);
    expect(deps.comparisons.addArm).toHaveBeenCalledWith("cmp-1", "task-3", "opencode", 1);
    expect(deps.turns.ask).toHaveBeenCalledWith("task-2", "user-1", { message: "Build it", action: "code", agentId: "claude" });
    expect(deps.turns.ask).toHaveBeenCalledWith("task-3", "user-1", { message: "Build it", action: "code", agentId: "opencode" });
    expect(deps.discussion.create).toHaveBeenCalledWith("task-1", "user-1", "Comparing Claude Code (WEB-2), OpenCode (WEB-3) on forks of this task.");
  });

  it("forks at a finished turn from the commit pushed by then", async () => {
    const { deps, service } = setup();

    await service.start("task-1", "user-1", { agentIds: ["claude", "opencode"], message: "", fromTurnId: "turn-4" });

    expect(deps.forkPoints.lastCommitBy).toHaveBeenCalledWith("task-1", FINISHED_AT);
    expect(deps.comparisons.create).toHaveBeenCalledWith(
      expect.objectContaining({ forkedFromTurnId: "turn-4", forkedAt: FINISHED_AT, baseBranch: "viberglass/task-1", baseCommit: "abc123" }),
    );
    expect(deps.forks.fork).toHaveBeenCalledWith(PARENT, FINISHED_AT, expect.any(String), "user-1");
  });

  it("forks now from the head of the task's branch without a turn", async () => {
    const { deps, service } = setup();

    await service.start("task-1", "user-1", { agentIds: ["claude", "opencode"], message: "Plan it", action: "plan" });

    expect(deps.comparisons.create).toHaveBeenCalledWith(expect.objectContaining({ forkedFromTurnId: null, baseBranch: "viberglass/task-1", baseCommit: null }));
  });

  it("refuses a turn that isn't one of the task's finished turns", async () => {
    const { deps, service } = setup();
    deps.forkPoints.turnFinishedAt.mockResolvedValue(null);

    await expect(service.start("task-1", "user-1", { agentIds: ["claude", "opencode"], message: "", fromTurnId: "turn-x" })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(deps.forks.fork).not.toHaveBeenCalled();
  });

  it.each([[["claude"]], [["claude", "claude"]], [["a", "b", "c", "d", "e"]]])("refuses %j: two to four different runners", async (agentIds) => {
    const { deps, service } = setup();

    await expect(service.start("task-1", "user-1", { agentIds, message: "" })).rejects.toMatchObject({ statusCode: 400 });
    expect(deps.comparisons.create).not.toHaveBeenCalled();
  });

  it("refuses in a Files space, whose runs share its files", async () => {
    const { deps, service } = setup();
    deps.execution.backingOf.mockResolvedValue("files");

    await expect(service.start("task-1", "user-1", { agentIds: ["claude", "opencode"], message: "" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("checks every runner can run before forking anything", async () => {
    const { deps, service } = setup();
    deps.agents.resolve.mockRejectedValueOnce(new Error("Claude Code can't run yet."));

    await expect(service.start("task-1", "user-1", { agentIds: ["claude", "opencode"], message: "" })).rejects.toThrow("can't run yet");
    expect(deps.forks.fork).not.toHaveBeenCalled();
  });

  it("keeps the other forks running when one can't start", async () => {
    const { deps, service } = setup();
    deps.turns.ask.mockRejectedValueOnce(new Error("busy"));

    await expect(service.start("task-1", "user-1", { agentIds: ["claude", "opencode"], message: "Go" })).resolves.toBe("cmp-1");
    expect(deps.turns.ask).toHaveBeenCalledTimes(2);
  });
});

describe("TaskComparisonService.pickWinner", () => {
  it("points the original at the fork and says so in its thread", async () => {
    const { deps, service } = setup();

    await service.pickWinner("task-1", "cmp-1", "task-2", "user-1");

    expect(deps.comparisons.setWinner).toHaveBeenCalledWith("cmp-1", "task-2");
    expect(deps.discussion.create).toHaveBeenCalledWith("task-1", "user-1", "Picked Claude Code's work from the comparison: WEB-2.");
  });

  it("refuses a task that isn't one of the comparison's forks", async () => {
    const { deps, service } = setup();

    await expect(service.pickWinner("task-1", "cmp-1", "task-9", "user-1")).rejects.toMatchObject({ statusCode: 400 });
    expect(deps.comparisons.setWinner).not.toHaveBeenCalled();
  });

  it("refuses another task's comparison", async () => {
    const { deps, service } = setup();

    await expect(service.pickWinner("task-5", "cmp-1", "task-2", "user-1")).rejects.toMatchObject({ statusCode: 404 });
    expect(deps.comparisons.setWinner).not.toHaveBeenCalled();
  });
});
