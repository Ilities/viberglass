import type { ComparisonArmRecord } from "../../../../persistence/ticketing/TaskComparisonDAO";
import { ComparisonForkQueue } from "../../../../services/tasks/ComparisonForkQueue";

const arm = (ticketId: string, position: number, overrides: Partial<ComparisonArmRecord> = {}): ComparisonArmRecord => ({
  ticketId,
  comparisonId: "cmp-1",
  key: `WEB-${position + 2}`,
  title: "Pricing",
  status: "open",
  runner: { id: `runner-${position}`, name: `Runner ${position}`, slug: `runner-${position}` },
  position,
  waiting: true,
  ...overrides,
});

function setup(arms: ComparisonArmRecord[]) {
  const waiting = arms.filter((candidate) => candidate.waiting).map((candidate) => ({ ticketId: candidate.ticketId, clankerId: candidate.runner.id }));
  const deps = {
    comparisons: {
      get: jest.fn().mockResolvedValue({ id: "cmp-1", createdBy: { id: "dev", name: "Dev" }, ask: { action: "code", message: "Please build the plan." } }),
      armOf: jest.fn().mockResolvedValue({ comparison: { id: "cmp-1" } }),
      listArms: jest.fn().mockResolvedValue(arms),
      claimNextWaiting: jest.fn(async () => waiting.shift() ?? null),
    },
    turns: { ask: jest.fn().mockResolvedValue({}) },
    running: { running: jest.fn().mockResolvedValue(new Map()) },
  };
  return { deps, queue: new ComparisonForkQueue(deps) };
}

describe("ComparisonForkQueue", () => {
  it("asks only the first fork when a comparison starts, as the person who started it", async () => {
    const { deps, queue } = setup([arm("fork-1", 0), arm("fork-2", 1), arm("fork-3", 2)]);

    await queue.startNext("cmp-1");

    expect(deps.turns.ask).toHaveBeenCalledTimes(1);
    expect(deps.turns.ask).toHaveBeenCalledWith("fork-1", "dev", { action: "code", message: "Please build the plan.", agentId: "runner-0" });
  });

  it("asks the next fork when a fork's run ends", async () => {
    const { deps, queue } = setup([arm("fork-1", 0, { waiting: false }), arm("fork-2", 1), arm("fork-3", 2)]);

    await queue.onActivity({ ticketId: "fork-1", kind: "run_failed", actorId: null, payload: {} });

    expect(deps.running.running).toHaveBeenCalledWith([]);
    expect(deps.turns.ask).toHaveBeenCalledTimes(1);
    expect(deps.turns.ask).toHaveBeenCalledWith("fork-2", "dev", expect.objectContaining({ agentId: "runner-1" }));
  });

  it("waits while another fork is still working", async () => {
    const { deps, queue } = setup([arm("fork-1", 0, { waiting: false }), arm("fork-2", 1, { waiting: false }), arm("fork-3", 2)]);
    deps.running.running.mockResolvedValue(new Map([["fork-2", { action: "code", since: new Date() }]]));

    await queue.onActivity({ ticketId: "fork-1", kind: "run_finished", actorId: null, payload: {} });

    expect(deps.running.running).toHaveBeenCalledWith(["fork-2"]);
    expect(deps.comparisons.claimNextWaiting).not.toHaveBeenCalled();
    expect(deps.turns.ask).not.toHaveBeenCalled();
  });

  it("skips a fork that can't start, and one finished while it waited", async () => {
    const { deps, queue } = setup([arm("fork-1", 0), arm("fork-2", 1, { status: "resolved" }), arm("fork-3", 2), arm("fork-4", 3)]);
    deps.turns.ask.mockRejectedValueOnce(new Error("The runner is busy"));

    await queue.startNext("cmp-1");

    expect(deps.turns.ask.mock.calls.map(([ticketId]) => ticketId)).toEqual(["fork-1", "fork-3"]);
  });

  it("ignores other activity and tasks outside a comparison", async () => {
    const { deps, queue } = setup([arm("fork-1", 0)]);

    await queue.onActivity({ ticketId: "fork-1", kind: "message_posted", actorId: "dev", payload: {} });
    deps.comparisons.armOf.mockResolvedValue(null);
    await queue.onActivity({ ticketId: "task-9", kind: "run_finished", actorId: null, payload: {} });

    expect(deps.comparisons.listArms).not.toHaveBeenCalled();
    expect(deps.turns.ask).not.toHaveBeenCalled();
  });

  it("does nothing once every fork has started", async () => {
    const { deps, queue } = setup([arm("fork-1", 0, { waiting: false }), arm("fork-2", 1, { waiting: false })]);

    await queue.onActivity({ ticketId: "fork-2", kind: "run_finished", actorId: null, payload: {} });

    expect(deps.comparisons.claimNextWaiting).not.toHaveBeenCalled();
  });
});
