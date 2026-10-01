import { StepApprovalRequestService } from "../../../../services/approvals/StepApprovalRequestService";

describe("StepApprovalRequestService", () => {
  const tickets = { getTicket: jest.fn() };
  const documents = { requestApproval: jest.fn() };
  const approvals = { recordApprovalAction: jest.fn() };
  const participants = { add: jest.fn() };
  const service = new StepApprovalRequestService({ tickets, documents, approvals, participants });

  beforeEach(() => {
    jest.clearAllMocks();
    tickets.getTicket.mockResolvedValue({ id: "ticket-1", workflowPhase: "planning" });
    documents.requestApproval.mockResolvedValue({ approvalState: "approval_requested" });
  });

  it("adds each person asked as a reviewer, once, and puts the plan up for approval", async () => {
    await expect(service.request("ticket-1", "planning", "maria", ["tomi", "kaisa", "tomi"])).resolves.toEqual({
      approvalState: "approval_requested",
    });

    expect(participants.add.mock.calls).toEqual([
      ["ticket-1", "tomi", "reviewer", "maria"],
      ["ticket-1", "kaisa", "reviewer", "maria"],
    ]);
    expect(documents.requestApproval).toHaveBeenCalledWith("ticket-1", "planning");
    expect(approvals.recordApprovalAction).toHaveBeenCalledWith("ticket-1", "planning", "approval_requested", "maria");
  });

  it("refuses a step the task isn't at", async () => {
    await expect(service.request("ticket-1", "research", "maria", ["tomi"])).rejects.toMatchObject({ code: "APPROVAL_INVALID_STEP" });
    expect(participants.add).not.toHaveBeenCalled();
  });
});
