import { PartialTurnService } from "../../../../services/taskTurns/PartialTurnService";

function setup(status = "cancelled") {
  const deps = {
    turns: { getByJobId: jest.fn().mockResolvedValue({ id: "turn-1", sessionId: "s-1", status }), update: jest.fn() },
    sessions: { getById: jest.fn().mockResolvedValue({ id: "s-1", ticketId: "t-1" }) },
    documents: { saveDocument: jest.fn().mockResolvedValue(undefined) },
  };
  return { deps, service: new PartialTurnService(deps) };
}

describe("PartialTurnService", () => {
  it("keeps a stopped turn's documents as versions and its work-in-progress commit", async () => {
    const { deps, service } = setup();
    expect(await service.keep("job-1", { documents: { research: "# Research so far", plan: "  " }, commitHash: "wip123" })).toEqual(["research", "code"]);

    expect(deps.documents.saveDocument).toHaveBeenCalledTimes(1);
    expect(deps.documents.saveDocument).toHaveBeenCalledWith("t-1", "research", "# Research so far", { source: "agent", agentTurnId: "turn-1" });
    expect(deps.turns.update).toHaveBeenCalledWith("turn-1", {
      contentJson: expect.objectContaining({ produced: ["research", "code"], commit: "wip123", stoppedPartway: true }),
    });
  });

  it("refuses work for a turn that wasn't stopped", async () => {
    const { deps, service } = setup("running");
    await expect(service.keep("job-1", { documents: { research: "x" } })).rejects.toThrow("No stopped turn");
    expect(deps.documents.saveDocument).not.toHaveBeenCalled();
  });
});
