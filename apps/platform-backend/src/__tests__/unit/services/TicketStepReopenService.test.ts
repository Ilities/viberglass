import { TicketStepReopenService } from "../../../services/TicketStepReopenService";
import { TicketServiceError } from "../../../services/errors/TicketServiceError";

describe("TicketStepReopenService", () => {
  const tickets = { getTicket: jest.fn() };
  const workflow = { setPhase: jest.fn() };
  const documents = { getOrCreateDocument: jest.fn(), requestApproval: jest.fn() };
  const approvals = { recordApprovalAction: jest.fn() };
  const runGuard = { assertIdle: jest.fn() };
  const service = new TicketStepReopenService(tickets, workflow, documents, approvals, runGuard);

  beforeEach(() => {
    jest.resetAllMocks();
    tickets.getTicket.mockResolvedValue({ id: "ticket-1", workflowPhase: "execution" });
    documents.getOrCreateDocument.mockResolvedValue({ content: "# Document" });
    workflow.setPhase.mockImplementation(async (id: string, phase: string) => ({ id, workflowPhase: phase }));
  });

  it("takes the task back to research and puts research and the plan up for approval again", async () => {
    await expect(service.reopen("ticket-1", "research", "user-1")).resolves.toMatchObject({ workflowPhase: "research" });

    expect(documents.requestApproval.mock.calls).toEqual([
      ["ticket-1", "research"],
      ["ticket-1", "planning"],
    ]);
    expect(approvals.recordApprovalAction).toHaveBeenCalledWith("ticket-1", "planning", "revoked", "user-1", "Reopened the research step");
    expect(workflow.setPhase).toHaveBeenCalledWith("ticket-1", "research");
  });

  it("reopening the plan leaves the research approved", async () => {
    await service.reopen("ticket-1", "planning", null);

    expect(documents.requestApproval.mock.calls.map(([, phase]) => phase)).toEqual(["planning"]);
    expect(workflow.setPhase).toHaveBeenCalledWith("ticket-1", "planning");
  });

  it("skips a later step that has no document yet", async () => {
    tickets.getTicket.mockResolvedValue({ id: "ticket-1", workflowPhase: "planning" });
    documents.getOrCreateDocument.mockImplementation(async (_id: string, phase: string) => ({ content: phase === "planning" ? "" : "# Research" }));

    await service.reopen("ticket-1", "research", null);

    expect(documents.requestApproval.mock.calls.map(([, phase]) => phase)).toEqual(["research"]);
  });

  it("refuses a step the task has not moved past", async () => {
    tickets.getTicket.mockResolvedValue({ id: "ticket-1", workflowPhase: "planning" });

    await expect(service.reopen("ticket-1", "planning", null)).rejects.toMatchObject({ code: "STEP_REOPEN_INVALID" });
    expect(workflow.setPhase).not.toHaveBeenCalled();
  });

  it("refuses while the current step has a run in progress", async () => {
    runGuard.assertIdle.mockRejectedValue(new TicketServiceError("PHASE_RUN_IN_PROGRESS", "A build is running"));

    await expect(service.reopen("ticket-1", "planning", null)).rejects.toThrow("A build is running");
    expect(runGuard.assertIdle).toHaveBeenCalledWith("ticket-1", "execution");
    expect(workflow.setPhase).not.toHaveBeenCalled();
  });

  it("reports a missing task", async () => {
    tickets.getTicket.mockResolvedValue(null);

    await expect(service.reopen("ticket-9", "research", null)).rejects.toMatchObject({ code: "TICKET_NOT_FOUND" });
  });
});
