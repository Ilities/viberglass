import { TicketPhaseOrchestrationService } from "../../../services/TicketPhaseOrchestrationService";
import { APPROVAL_POLICY_ERROR_CODE, ApprovalPolicyError } from "../../../services/errors/ApprovalPolicyError";

const mockDocuments = { getOrCreateDocument: jest.fn() };
jest.mock("../../../services/TicketPhaseDocumentService", () => ({
  TicketPhaseDocumentService: jest.fn(() => mockDocuments),
}));

describe("TicketPhaseOrchestrationService (Slack, MCP and chains)", () => {
  const tickets = { getTicket: jest.fn() };
  const workflow = { setPhase: jest.fn() };
  const planningApproval = { approve: jest.fn() };
  const researchApproval = { approve: jest.fn() };
  const turns = { ask: jest.fn() };
  const service = new TicketPhaseOrchestrationService(tickets, workflow, planningApproval, researchApproval, turns);

  beforeEach(() => {
    jest.clearAllMocks();
    mockDocuments.getOrCreateDocument.mockResolvedValue({ approvalState: "approval_requested" });
    turns.ask.mockResolvedValue({ job: { id: "job-1", status: "pending" } });
  });

  it("approves the research as the person moving the task on to the plan", async () => {
    tickets.getTicket.mockResolvedValue({ id: "t-1", workflowPhase: "research" });

    await service.advanceAndRun({ ticketId: "t-1", clankerId: "c-1", targetPhase: "planning", actorId: "maria" });

    expect(researchApproval.approve).toHaveBeenCalledWith("t-1", "maria");
    expect(planningApproval.approve).not.toHaveBeenCalled();
    expect(workflow.setPhase).toHaveBeenCalledWith("t-1", "planning");
    expect(turns.ask).toHaveBeenCalledWith("t-1", "maria", { message: "", action: "plan", agentId: "c-1" });
  });

  it("approves the plan as the person starting the build", async () => {
    tickets.getTicket.mockResolvedValue({ id: "t-1", workflowPhase: "planning" });

    await service.advanceAndRun({ ticketId: "t-1", clankerId: "c-1", targetPhase: "execution", actorId: "tomi" });

    expect(researchApproval.approve).not.toHaveBeenCalled();
    expect(planningApproval.approve).toHaveBeenCalledWith("t-1", "tomi");
    expect(turns.ask).toHaveBeenCalledWith("t-1", "tomi", { message: "", action: "code", agentId: "c-1" });
  });

  it("starts no build when the person may not approve the plan", async () => {
    tickets.getTicket.mockResolvedValue({ id: "t-1", workflowPhase: "planning" });
    planningApproval.approve.mockRejectedValueOnce(new ApprovalPolicyError(APPROVAL_POLICY_ERROR_CODE.NOT_ELIGIBLE, "Only Tomi can approve the plan."));

    await expect(service.advanceAndRun({ ticketId: "t-1", clankerId: "c-1", targetPhase: "execution", actorId: "maria" })).rejects.toThrow(
      "Only Tomi can approve the plan.",
    );
    expect(turns.ask).not.toHaveBeenCalled();
  });

  it("takes no approval again for a plan already approved, or a task skipped to the build", async () => {
    tickets.getTicket.mockResolvedValue({ id: "t-1", workflowPhase: "execution" });
    mockDocuments.getOrCreateDocument.mockResolvedValue({ approvalState: "approved" });
    await service.approveUpTo("t-1", "execution", "maria");

    tickets.getTicket.mockResolvedValue({ id: "t-1", workflowPhase: "execution", workflowOverriddenAt: "2026-10-01T00:00:00Z" });
    mockDocuments.getOrCreateDocument.mockResolvedValue({ approvalState: "draft" });
    await service.approveUpTo("t-1", "execution", "maria");

    expect(planningApproval.approve).not.toHaveBeenCalled();
  });

  it("needs no approval to go back to research", async () => {
    tickets.getTicket.mockResolvedValue({ id: "t-1", workflowPhase: "planning" });

    await service.approveUpTo("t-1", "research", null);

    expect(researchApproval.approve).not.toHaveBeenCalled();
    expect(planningApproval.approve).not.toHaveBeenCalled();
  });
});
