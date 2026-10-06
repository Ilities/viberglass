import { TASK_ASK_POLICY_ERROR_CODE } from "../../../../services/errors/TaskAskPolicyError";
import { CARRY_ON, TaskSteeringService } from "../../../../services/taskTurns/TaskSteeringService";

const session = (overrides: Record<string, unknown> = {}) => ({
  id: "s-1",
  ticketId: "t-1",
  clankerId: "claude",
  status: "active",
  updatedAt: new Date("2026-10-03T09:00:00Z"),
  ...overrides,
});
const turn = (overrides: Record<string, unknown> = {}) => ({
  id: "running",
  role: "assistant",
  status: "cancelled",
  action: "plan",
  createdAt: new Date("2026-10-03T09:00:00Z"),
  ...overrides,
});

function setup(options: { canSteer?: boolean; askStatus?: string; cancelled?: string } = {}) {
  const deps = {
    policy: { describe: jest.fn().mockResolvedValue({ canPost: true, canAsk: true, canAskForCode: true, canSteer: options.canSteer ?? true }) },
    turns: {
      ask: jest.fn().mockResolvedValue({
        session: session(),
        currentTurn: { id: "running" },
        job: { id: options.askStatus === "pending" ? "job-new" : "job-running", status: options.askStatus ?? "queued" },
        messageId: "m-1",
      }),
    },
    sessions: {
      listByTicket: jest.fn().mockResolvedValue([session(), session({ id: "s-old", status: "completed" })]),
      getById: jest.fn().mockResolvedValue(session({ status: "waiting_on_user" })),
      update: jest.fn().mockResolvedValue(undefined),
    },
    agentTurns: {
      getInFlightAssistantTurn: jest.fn().mockResolvedValue({ id: "running", jobId: "job-running" }),
      listBySession: jest.fn().mockResolvedValue([turn()]),
    },
    facts: { running: jest.fn().mockResolvedValue(new Map([["t-1", { action: "plan", since: new Date() }]])) },
    jobs: { cancel: jest.fn().mockResolvedValue(options.cancelled ?? "cancelled") },
    continuation: {
      launchForPendingMessages: jest.fn().mockResolvedValue({ currentTurn: { id: "next" }, job: { id: "job-next", status: "pending" } }),
    },
    activity: { record: jest.fn().mockResolvedValue(undefined) },
  };
  return { deps, service: new TaskSteeringService(deps) };
}

describe("TaskSteeringService", () => {
  describe("interrupting", () => {
    it("posts the message, stops the running turn and starts one that answers it at once, on the same step", async () => {
      const { deps, service } = setup();
      const result = await service.interrupt("t-1", "u-owner", { message: "Use the new API instead" });

      expect(deps.turns.ask).toHaveBeenCalledWith("t-1", "u-owner", { message: "Use the new API instead", action: "plan" });
      expect(deps.jobs.cancel).toHaveBeenCalledWith("job-running", "u-owner");
      expect(deps.continuation.launchForPendingMessages).toHaveBeenCalledWith(expect.objectContaining({ id: "s-1", status: "waiting_on_user" }));
      expect(result.job).toEqual({ id: "job-next", status: "pending" });
    });

    it("stops nothing when the agent wasn't working, or finished meanwhile", async () => {
      const idle = setup({ askStatus: "pending" });
      expect((await idle.service.interrupt("t-1", "u-owner", { message: "Go" })).job.id).toBe("job-new");
      expect(idle.deps.jobs.cancel).not.toHaveBeenCalled();

      const finished = setup({ cancelled: "terminal" });
      await finished.service.interrupt("t-1", "u-owner", { message: "Go" });
      expect(finished.deps.continuation.launchForPendingMessages).not.toHaveBeenCalled();
    });

    it("refuses someone who may only ask, before posting anything", async () => {
      const { deps, service } = setup({ canSteer: false });
      await expect(service.interrupt("t-1", "u-member", { message: "Stop" })).rejects.toMatchObject({ code: TASK_ASK_POLICY_ERROR_CODE.NOT_ALLOWED });
      expect(deps.turns.ask).not.toHaveBeenCalled();
    });
  });

  it("pauses: stops the running turn and holds the task's open sessions", async () => {
    const { deps, service } = setup();
    await service.pause("t-1", "u-owner");

    expect(deps.jobs.cancel).toHaveBeenCalledWith("job-running", "u-owner");
    expect(deps.sessions.update).toHaveBeenCalledTimes(1);
    expect(deps.sessions.update).toHaveBeenCalledWith("s-1", { status: "paused" });
    expect(deps.activity.record).toHaveBeenCalledWith("t-1", { type: "human", userId: "u-owner" }, "agent_paused", {});
  });

  describe("resuming", () => {
    it("starts a turn for what people asked while it was paused, when pausing stopped nothing", async () => {
      const { deps, service } = setup();
      deps.sessions.listByTicket.mockResolvedValue([session({ status: "paused" })]);
      deps.agentTurns.listBySession.mockResolvedValue([turn({ id: "done", status: "completed", action: "plan" })]);
      await service.resume("t-1", "u-owner");

      expect(deps.sessions.update).toHaveBeenCalledWith("s-1", { status: "waiting_on_user" });
      expect(deps.continuation.launchForPendingMessages).toHaveBeenCalled();
      expect(deps.turns.ask).not.toHaveBeenCalled();
      expect(deps.activity.record).toHaveBeenCalledWith("t-1", { type: "human", userId: "u-owner" }, "agent_resumed", {});
    });

    it("asks the agent to carry on with the step pausing stopped, which takes in what was written meanwhile", async () => {
      const { deps, service } = setup();
      deps.sessions.listByTicket.mockResolvedValue([session({ status: "paused" })]);
      await service.resume("t-1", "u-owner");

      expect(deps.sessions.update).toHaveBeenCalledWith("s-1", { status: "waiting_on_user" });
      expect(deps.turns.ask).toHaveBeenCalledWith("t-1", "u-owner", { message: CARRY_ON, action: "plan", agentId: "claude" });
      expect(deps.continuation.launchForPendingMessages).not.toHaveBeenCalled();
    });

    it("carries on only the work the task was on last, and releases older paused sessions without new runs", async () => {
      const { deps, service } = setup();
      deps.sessions.listByTicket.mockResolvedValue([
        session({ id: "s-qwen", clankerId: "qwen", status: "paused" }),
        session({ id: "s-claude", clankerId: "claude", status: "paused" }),
        session({ id: "s-opencode", clankerId: "opencode", status: "paused" }),
      ]);
      const lastTurns: Record<string, ReturnType<typeof turn>> = {
        "s-qwen": turn({ status: "failed", action: "plan", createdAt: new Date("2026-10-03T08:00:00Z") }),
        "s-claude": turn({ status: "cancelled", action: "code", createdAt: new Date("2026-10-03T09:20:00Z") }),
        "s-opencode": turn({ status: "failed", action: "plan", createdAt: new Date("2026-10-03T08:30:00Z") }),
      };
      deps.agentTurns.listBySession.mockImplementation(async (id: string) => [lastTurns[id]]);

      await expect(service.resumeTarget("t-1")).resolves.toEqual({ sessionId: "s-claude", clankerId: "claude", action: "code" });
      await service.resume("t-1", "u-owner", "Handed back: I fixed the test");

      expect(deps.turns.ask).toHaveBeenCalledTimes(1);
      expect(deps.turns.ask).toHaveBeenCalledWith("t-1", "u-owner", { message: "Handed back: I fixed the test", action: "code", agentId: "claude" });
      for (const id of ["s-qwen", "s-claude", "s-opencode"]) expect(deps.sessions.update).toHaveBeenCalledWith(id, { status: "waiting_on_user" });
      expect(deps.continuation.launchForPendingMessages).not.toHaveBeenCalled();
    });

    it("does nothing when the agent isn't paused", async () => {
      const { deps, service } = setup();
      await service.resume("t-1", "u-owner");
      expect(deps.sessions.update).not.toHaveBeenCalled();
      expect(deps.activity.record).not.toHaveBeenCalled();
    });
  });
});
