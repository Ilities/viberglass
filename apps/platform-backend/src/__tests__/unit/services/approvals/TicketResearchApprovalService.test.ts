import { TicketResearchApprovalService } from "../../../../services/approvals/TicketResearchApprovalService";
import { APPROVAL_POLICY_ERROR_CODE, ApprovalPolicyError } from "../../../../services/errors/ApprovalPolicyError";

describe("TicketResearchApprovalService", () => {
  const tickets = { getTicket: jest.fn() };
  const policy = { assertCanApprove: jest.fn() };
  const documents = { approveDocument: jest.fn() };
  const approvals = { recordApprovalAction: jest.fn() };
  const workflow = { advancePhase: jest.fn() };
  const activity = { record: jest.fn() };
  const service = new TicketResearchApprovalService({ tickets, policy, documents, approvals, workflow, activity });

  beforeEach(() => {
    jest.clearAllMocks();
    tickets.getTicket.mockResolvedValue({ id: "ticket-1", workflowPhase: "research" });
    policy.assertCanApprove.mockResolvedValue(undefined);
  });

  it("records who approved the research, then moves the task on to the plan", async () => {
    await service.approve("ticket-1", "maria");

    expect(policy.assertCanApprove).toHaveBeenCalledWith("maria", "ticket-1", "research");
    expect(documents.approveDocument).toHaveBeenCalledWith("ticket-1", "research", "maria");
    expect(approvals.recordApprovalAction).toHaveBeenCalledWith("ticket-1", "research", "approved", "maria", "Research approved");
    expect(activity.record).toHaveBeenCalledWith("ticket-1", { type: "human", userId: "maria" }, "document_approved", { step: "research" });
    expect(workflow.advancePhase).toHaveBeenCalledWith("ticket-1", "planning");
  });

  it("refuses someone the policy doesn't allow, and leaves the task where it is", async () => {
    policy.assertCanApprove.mockRejectedValue(new ApprovalPolicyError(APPROVAL_POLICY_ERROR_CODE.NOT_ELIGIBLE, "Only Maria can approve the research."));

    await expect(service.approve("ticket-1", "stranger")).rejects.toThrow("Only Maria can approve the research.");
    expect(documents.approveDocument).not.toHaveBeenCalled();
    expect(workflow.advancePhase).not.toHaveBeenCalled();
  });

  it("refuses a task that has already moved on from research", async () => {
    tickets.getTicket.mockResolvedValue({ id: "ticket-1", workflowPhase: "planning" });

    await expect(service.approve("ticket-1", "maria")).rejects.toMatchObject({ code: "APPROVAL_INVALID_STEP", statusCode: 409 });
    expect(policy.assertCanApprove).not.toHaveBeenCalled();
  });
});
