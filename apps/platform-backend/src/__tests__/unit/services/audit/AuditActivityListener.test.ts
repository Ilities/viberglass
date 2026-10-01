import { AuditActivityListener } from "../../../../services/audit/AuditActivityListener";

describe("AuditActivityListener", () => {
  const audit = { record: jest.fn() };
  const listener = new AuditActivityListener(audit);

  beforeEach(() => jest.clearAllMocks());

  it("records runs started and cancelled as the person who did them", async () => {
    await listener.onActivity({ ticketId: "t-1", kind: "run_started", actorId: "maria", payload: { jobId: "job-1", step: "research" } });
    await listener.onActivity({ ticketId: "t-1", kind: "run_cancelled", actorId: "jussi", payload: { jobId: "job-1", step: "research" } });

    expect(audit.record.mock.calls.map(([event]) => [event.action, event.target, event.actorId])).toEqual([
      ["run.started", { type: "run", id: "job-1" }, "maria"],
      ["run.cancelled", { type: "run", id: "job-1" }, "jussi"],
    ]);
    expect(audit.record.mock.calls[0][0].details).toEqual({ taskId: "t-1", step: "research" });
  });

  it("leaves the rest of a task's Activity out of the audit log", async () => {
    await listener.onActivity({ ticketId: "t-1", kind: "message_posted", actorId: "maria", payload: {} });
    expect(audit.record).not.toHaveBeenCalled();
  });
});
