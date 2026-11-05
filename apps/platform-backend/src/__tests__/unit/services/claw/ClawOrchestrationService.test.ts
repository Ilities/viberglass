import { ClawOrchestrationService } from "../../../../services/claw/ClawOrchestrationService";

const getSchedule = jest.fn();
const updateLastRun = jest.fn();
const createExecution = jest.fn();
const recordExecutionResult = jest.fn();
const sendWebhook = jest.fn();
const getTemplate = jest.fn();

jest.mock("../../../../persistence/claw/ClawScheduleDAO", () => ({
  ClawScheduleDAO: jest.fn().mockImplementation(() => ({ getSchedule, updateLastRun })),
}));
jest.mock("../../../../persistence/claw/ClawTaskTemplateDAO", () => ({
  ClawTaskTemplateDAO: jest.fn().mockImplementation(() => ({ getTemplate })),
}));
jest.mock("../../../../services/claw/ClawExecutionService", () => ({
  ClawExecutionService: jest.fn().mockImplementation(() => ({ createExecution, recordExecutionResult })),
}));
jest.mock("../../../../services/claw/ClawWebhookService", () => ({
  ClawWebhookService: jest.fn().mockImplementation(() => ({ sendWebhook })),
}));
jest.mock("../../../../provisioning/provisioningFactory", () => ({ getClankerProvisioner: jest.fn() }));

describe("ClawOrchestrationService with an app schedule", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createExecution.mockResolvedValue({ id: "execution-1", scheduleId: "schedule-1" });
    recordExecutionResult.mockResolvedValue({ id: "execution-1", status: "completed" });
  });

  it("turns the app off without a job and completes the run at once", async () => {
    getSchedule.mockResolvedValue({ id: "schedule-1", projectId: "space-1", action: "app_stop", taskTemplateId: null });
    const setPower = jest.fn().mockResolvedValue({});

    const started = await new ClawOrchestrationService(() => ({ setPower })).executeScheduledTask("schedule-1");

    expect(started).toEqual({ executionId: "execution-1" });
    expect(setPower).toHaveBeenCalledWith("space-1", "off");
    expect(getTemplate).not.toHaveBeenCalled();
    expect(recordExecutionResult).toHaveBeenCalledWith("execution-1", { status: "completed", result: { power: "off" } });
    expect(sendWebhook.mock.calls.map((call) => call[2])).toEqual(["started", "completed"]);
  });

  it("fails the run when the app can't be turned on", async () => {
    getSchedule.mockResolvedValue({ id: "schedule-1", projectId: "space-1", action: "app_start", taskTemplateId: null });
    const setPower = jest.fn().mockRejectedValue(new Error("This space is archived, so its app stays off."));

    await expect(new ClawOrchestrationService(() => ({ setPower })).executeScheduledTask("schedule-1")).rejects.toThrow("archived");

    expect(setPower).toHaveBeenCalledWith("space-1", "on");
    expect(recordExecutionResult).toHaveBeenCalledWith("execution-1", {
      status: "failed",
      errorMessage: "This space is archived, so its app stays off.",
    });
  });
});
