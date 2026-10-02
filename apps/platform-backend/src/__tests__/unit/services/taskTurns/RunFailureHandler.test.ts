import type { TaskActivityKind } from "@viberglass/types";
import { RunFailureHandler } from "../../../../services/taskTurns/RunFailureHandler";

function setup(turnStatus = "running", sessionStatus = "active") {
  const deps = {
    turns: { getByJobId: jest.fn().mockResolvedValue({ id: "turn-1", sessionId: "s-1", status: turnStatus }), update: jest.fn() },
    sessions: { getById: jest.fn().mockResolvedValue({ id: "s-1", status: sessionStatus }), update: jest.fn() },
    events: { getMaxSequence: jest.fn().mockResolvedValue(4), create: jest.fn() },
  };
  return { deps, handler: new RunFailureHandler(deps) };
}

const failed = (payload: Record<string, unknown>, kind: TaskActivityKind = "run_failed") => ({ ticketId: "t-1", kind, actorId: null, payload });

describe("RunFailureHandler", () => {
  it("ends a turn its worker never reported on, and leaves the session waiting on people", async () => {
    const { deps, handler } = setup();
    await handler.onActivity(failed({ jobId: "job-1", category: "platform", reason: "Run lost" }));

    expect(deps.turns.update).toHaveBeenCalledWith("turn-1", expect.objectContaining({ status: "failed" }));
    expect(deps.events.create).toHaveBeenCalledWith(expect.objectContaining({ sequence: 5, eventType: "turn_failed", payloadJson: { reason: "Run lost", jobId: "job-1" } }));
    expect(deps.sessions.update).toHaveBeenCalledWith("s-1", { status: "waiting_on_user" });
  });

  it("pauses the agent after a setup failure, so asks wait for the fix", async () => {
    const { deps, handler } = setup("failed");
    await handler.onActivity(failed({ jobId: "job-1", category: "setup", reason: "Repository not reachable" }));

    // The worker reported this turn's failure already.
    expect(deps.turns.update).not.toHaveBeenCalled();
    expect(deps.sessions.update).toHaveBeenCalledWith("s-1", { status: "paused" });
  });

  it("leaves alone a session the worker's report moved on, and other activity", async () => {
    const reported = setup("failed", "active");
    await reported.handler.onActivity(failed({ jobId: "job-1", category: "agent" }));
    expect(reported.deps.sessions.update).not.toHaveBeenCalled();

    const ended = setup("running", "cancelled");
    await ended.handler.onActivity(failed({ jobId: "job-1", category: "setup" }));
    expect(ended.deps.sessions.update).not.toHaveBeenCalled();

    const other = setup();
    await other.handler.onActivity(failed({ jobId: "job-1" }, "run_finished"));
    expect(other.deps.turns.getByJobId).not.toHaveBeenCalled();
  });
});
