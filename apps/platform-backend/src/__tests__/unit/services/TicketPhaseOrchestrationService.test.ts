import { TicketPhaseOrchestrationService } from "../../../services/TicketPhaseOrchestrationService";
import { TASK_ASK_POLICY_ERROR_CODE, TaskAskPolicyError } from "../../../services/errors/TaskAskPolicyError";

describe("TicketPhaseOrchestrationService (Slack, MCP and chains)", () => {
  const turns = { ask: jest.fn() };
  const service = new TicketPhaseOrchestrationService(turns);

  beforeEach(() => {
    jest.clearAllMocks();
    turns.ask.mockResolvedValue({ job: { id: "job-1", status: "pending" } });
  });

  it("asks the agent for the step's work as the person moving the task on", async () => {
    await expect(
      service.advanceAndRun({ ticketId: "t-1", clankerId: "c-1", targetPhase: "planning", actorId: "maria" }),
    ).resolves.toEqual({ jobId: "job-1", status: "pending" });

    expect(turns.ask).toHaveBeenCalledWith("t-1", "maria", { message: "", action: "plan", agentId: "c-1" });
  });

  it("asks for a build with nothing approved first", async () => {
    await service.advanceAndRun({ ticketId: "t-1", clankerId: "c-1", targetPhase: "execution", actorId: "tomi" });

    expect(turns.ask).toHaveBeenCalledWith("t-1", "tomi", { message: "", action: "code", agentId: "c-1" });
  });

  it("passes on a refusal from the ask policy", async () => {
    turns.ask.mockRejectedValueOnce(new TaskAskPolicyError(TASK_ASK_POLICY_ERROR_CODE.NOT_ALLOWED, "Only the task's people can ask the agent to build."));

    await expect(service.advanceAndRun({ ticketId: "t-1", clankerId: "c-1", targetPhase: "execution", actorId: "maria" })).rejects.toThrow(
      "Only the task's people can ask the agent to build.",
    );
  });
});
