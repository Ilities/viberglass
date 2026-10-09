import { runAsActor } from "../../../../api/auth/requestActor";
import { AuditRecorder } from "../../../../services/audit/AuditRecorder";

describe("AuditRecorder", () => {
  const log = { record: jest.fn() };
  const audit = new AuditRecorder(log);

  beforeEach(() => jest.clearAllMocks());

  it("credits a chat action to the person who linked that account, and says which service it came from", async () => {
    await runAsActor({ userId: "maria", chat: { adapterName: "slack", chatUserId: "U123" } }, () =>
      audit.record({ action: "run.started", target: { type: "run", id: "job-1" }, details: { step: "planning" } }),
    );

    expect(log.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "maria", details: { step: "planning", via: "slack", chatUserId: "U123" } }),
    );
  });

  it("still names the chat account when nobody linked it", async () => {
    await runAsActor({ userId: null, chat: { adapterName: "slack", chatUserId: "U999" } }, () => audit.record({ action: "run.started", target: { type: "run", id: "job-2" } }));

    expect(log.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: null, details: { via: "slack", chatUserId: "U999" } }));
  });

  it("never fails the change it describes", async () => {
    log.record.mockRejectedValueOnce(new Error("database down"));
    await expect(audit.record({ action: "secret.deleted", target: { type: "secret", id: "s-1" } })).resolves.toBeUndefined();
  });
});
