import { PartialTurnService } from "../../../../services/taskTurns/PartialTurnService";

function setup(status = "cancelled", action: string | null = "plan", files: object | null = null) {
  const deps = {
    turns: { getByJobId: jest.fn().mockResolvedValue({ id: "turn-1", sessionId: "s-1", status, action }), update: jest.fn() },
    sessions: { getById: jest.fn().mockResolvedValue({ id: "s-1", ticketId: "t-1" }) },
    documents: { saveDocument: jest.fn().mockResolvedValue(undefined) },
    files: { summaryForJob: jest.fn().mockResolvedValue(files) },
  };
  return { deps, service: new PartialTurnService(deps) };
}

describe("PartialTurnService", () => {
  it("keeps a stopped turn's plan as a version and its work-in-progress commit", async () => {
    const { deps, service } = setup();
    expect(await service.keep("job-1", { documents: { plan: "# Plan so far" }, commitHash: "wip123" })).toEqual(["plan", "code"]);

    expect(deps.documents.saveDocument).toHaveBeenCalledTimes(1);
    expect(deps.documents.saveDocument).toHaveBeenCalledWith("t-1", "planning", "# Plan so far", { source: "agent", agentTurnId: "turn-1" });
    expect(deps.turns.update).toHaveBeenCalledWith("turn-1", {
      contentJson: expect.objectContaining({ produced: ["plan", "code"], commit: "wip123", stoppedPartway: true }),
    });
  });

  it("doesn't keep an empty plan", async () => {
    const { deps, service } = setup();
    expect(await service.keep("job-1", { documents: { plan: "  " } })).toEqual([]);
    expect(deps.documents.saveDocument).not.toHaveBeenCalled();
  });

  it("keeps the plan only from a turn that was asked for it", async () => {
    const { deps, service } = setup("cancelled", "code");
    expect(await service.keep("job-1", { documents: { plan: "# Plan rewritten by a build" }, commitHash: "wip123" })).toEqual(["code"]);

    expect(deps.documents.saveDocument).not.toHaveBeenCalled();
  });

  it("records the files a stopped Files run saved", async () => {
    const files = { id: "snap-1", parentId: null, fileCount: 3, totalBytes: 10, partial: true, changes: { added: 1, changed: 0, removed: 0 }, createdAt: "2026-10-14T10:00:00.000Z" };
    const { deps, service } = setup("cancelled", "code", files);
    expect(await service.keep("job-1", { documents: {} })).toEqual([]);

    expect(deps.files.summaryForJob).toHaveBeenCalledWith("job-1");
    expect(deps.turns.update).toHaveBeenCalledWith("turn-1", { contentJson: expect.objectContaining({ stoppedPartway: true, files }) });
  });

  it("refuses work for a turn that wasn't stopped", async () => {
    const { deps, service } = setup("running");
    await expect(service.keep("job-1", { documents: { plan: "x" } })).rejects.toThrow("No stopped turn");
    expect(deps.documents.saveDocument).not.toHaveBeenCalled();
  });
});
