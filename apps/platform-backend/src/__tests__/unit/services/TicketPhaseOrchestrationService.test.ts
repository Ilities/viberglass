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
  const research = { runResearch: jest.fn() };
  const planning = { runPlanning: jest.fn() };
  const execution = { runTicket: jest.fn() };
  const service = new TicketPhaseOrchestrationService(
    tickets,
    workflow,
    planningApproval,
    researchApproval,
    research,
    planning,
    execution,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockDocuments.getOrCreateDocument.mockResolvedValue({ approvalState: "approval_requested" });
    planning.runPlanning.mockResolvedValue({ jobId: "job-plan", status: "queued" });
    execution.runTicket.mockResolvedValue({ jobId: "job-build", status: "queued" });
  });

  it("approves the research as the person moving the task on to the plan", async () => {
    tickets.getTicket.mockResolvedValue({ id: "t-1", workflowPhase: "research" });

    await service.advanceAndRun({ ticketId: "t-1", clankerId: "c-1", targetPhase: "planning", actorId: "maria" });

    expect(researchApproval.approve).toHaveBeenCalledWith("t-1", "maria");
    expect(planningApproval.approve).not.toHaveBeenCalled();
    expect(planning.runPlanning).toHaveBeenCalledWith("t-1", { clankerId: "c-1" });
  });

  it("approves the plan as the person starting the build", async () => {
    tickets.getTicket.mockResolvedValue({ id: "t-1", workflowPhase: "planning" });

    await service.advanceAndRun({ ticketId: "t-1", clankerId: "c-1", targetPhase: "execution", actorId: "tomi" });

    expect(researchApproval.approve).not.toHaveBeenCalled();
    expect(planningApproval.approve).toHaveBeenCalledWith("t-1", "tomi");
    expect(execution.runTicket).toHaveBeenCalled();
  });

  it("starts no build when the person may not approve the plan", async () => {
    tickets.getTicket.mockResolvedValue({ id: "t-1", workflowPhase: "planning" });
    planningApproval.approve.mockRejectedValueOnce(new ApprovalPolicyError(APPROVAL_POLICY_ERROR_CODE.NOT_ELIGIBLE, "Only Tomi can approve the plan."));

    await expect(service.advanceAndRun({ ticketId: "t-1", clankerId: "c-1", targetPhase: "execution", actorId: "maria" })).rejects.toThrow(
      "Only Tomi can approve the plan.",
    );
    expect(execution.runTicket).not.toHaveBeenCalled();
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
