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

  it("hands an app schedule to the app actions, without a job", async () => {
    const schedule = { id: "schedule-1", projectId: "space-1", action: "app_restore_data", taskTemplateId: null, backupId: "backup-1" };
    getSchedule.mockResolvedValue(schedule);
    const run = jest.fn().mockResolvedValue(undefined);

    const started = await new ClawOrchestrationService({ run }).executeScheduledTask("schedule-1");

    expect(started).toEqual({ executionId: "execution-1" });
    expect(run).toHaveBeenCalledWith(schedule, { id: "execution-1", scheduleId: "schedule-1" });
    expect(getTemplate).not.toHaveBeenCalled();
    expect(recordExecutionResult).not.toHaveBeenCalled();
  });

  it("fails the run when the app action can't be done", async () => {
    getSchedule.mockResolvedValue({ id: "schedule-1", projectId: "space-1", action: "app_start", taskTemplateId: null });
    const run = jest.fn().mockRejectedValue(new Error("This space is archived, so its app stays off."));

    await expect(new ClawOrchestrationService({ run }).executeScheduledTask("schedule-1")).rejects.toThrow("archived");

    expect(recordExecutionResult).toHaveBeenCalledWith("execution-1", {
      status: "failed",
      errorMessage: "This space is archived, so its app stays off.",
    });
  });
});
