import { runAsActor } from "../../../../api/auth/requestActor";
import { AuditRecorder } from "../../../../services/audit/AuditRecorder";

describe("AuditRecorder", () => {
  const log = { record: jest.fn() };
  const audit = new AuditRecorder(log);

  beforeEach(() => jest.clearAllMocks());

  it("credits a Slack action to the person who linked that account, and says it came from Slack", async () => {
    await runAsActor({ userId: "maria", slackUserId: "U123" }, () =>
      audit.record({ action: "run.started", target: { type: "run", id: "job-1" }, details: { step: "planning" } }),
    );

    expect(log.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "maria", details: { step: "planning", via: "slack", slackUserId: "U123" } }),
    );
  });

  it("still names the Slack user when nobody linked that account", async () => {
    await runAsActor({ userId: null, slackUserId: "U999" }, () => audit.record({ action: "run.started", target: { type: "run", id: "job-2" } }));

    expect(log.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: null, details: { via: "slack", slackUserId: "U999" } }));
  });

  it("never fails the change it describes", async () => {
    log.record.mockRejectedValueOnce(new Error("database down"));
    await expect(audit.record({ action: "secret.deleted", target: { type: "secret", id: "s-1" } })).resolves.toBeUndefined();
  });
});
