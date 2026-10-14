import type { ClawExecution, ClawSchedule } from "@viberglass/types";
import { ClawRunCompletion } from "../../../../services/claw/ClawRunCompletion";

const execution: ClawExecution = {
  id: "exec-1",
  scheduleId: "sched-1",
  jobId: "job-1",
  status: "completed",
  startedAt: null,
  completedAt: null,
  errorMessage: null,
  result: null,
  webhookDeliveryStatus: null,
  createdAt: "2026-10-14T00:00:00.000Z",
};

const schedule: ClawSchedule = {
  id: "sched-1",
  projectId: "proj-1",
  taskTemplateId: "tmpl-1",
  name: "Nightly",
  description: null,
  scheduleType: "interval",
  intervalExpression: "1d",
  cronExpression: null,
  timezone: "UTC",
  isActive: true,
  lastRunAt: null,
  nextRunAt: null,
  runCount: 0,
  failureCount: 0,
  webhookConfig: null,
  createdBy: null,
  createdAt: "2026-10-14T00:00:00.000Z",
  updatedAt: "2026-10-14T00:00:00.000Z",
};

const clawJob = { id: "job-1", context: { clawExecutionId: "exec-1", clawScheduleId: "sched-1" } };

describe("ClawRunCompletion", () => {
  const executions = { recordExecutionResult: jest.fn() };
  const schedules = { getSchedule: jest.fn() };
  const webhooks = { sendWebhook: jest.fn() };
  const completion = new ClawRunCompletion(executions, schedules, webhooks);

  beforeEach(() => {
    jest.clearAllMocks();
    executions.recordExecutionResult.mockResolvedValue(execution);
    schedules.getSchedule.mockResolvedValue(schedule);
    webhooks.sendWebhook.mockResolvedValue(undefined);
  });

  it("ends the scheduled run of a job that completed and sends the completed webhook", async () => {
    await completion.finish(clawJob, { status: "completed", result: { success: true } });

    expect(executions.recordExecutionResult).toHaveBeenCalledWith("exec-1", {
      status: "completed",
      result: { success: true },
      jobId: "job-1",
    });
    expect(webhooks.sendWebhook).toHaveBeenCalledWith(schedule, execution, "completed", { result: { success: true } });
  });

  it("ends the scheduled run of a job that failed and sends the failed webhook", async () => {
    await completion.finish(clawJob, { status: "failed", errorMessage: "Worker disappeared" });

    expect(executions.recordExecutionResult).toHaveBeenCalledWith("exec-1", expect.objectContaining({ status: "failed" }));
    expect(webhooks.sendWebhook).toHaveBeenCalledWith(schedule, execution, "failed", { errorMessage: "Worker disappeared" });
  });

  it("ends a cancelled run without a webhook, since webhooks have no cancelled event", async () => {
    await completion.finish(clawJob, { status: "cancelled", errorMessage: "Run cancelled by user" });

    expect(executions.recordExecutionResult).toHaveBeenCalledWith("exec-1", expect.objectContaining({ status: "cancelled" }));
    expect(webhooks.sendWebhook).not.toHaveBeenCalled();
  });

  it("sends nothing a second time for a run that had already ended", async () => {
    executions.recordExecutionResult.mockResolvedValue(null);

    await completion.finish(clawJob, { status: "failed", errorMessage: "late sweeper" });

    expect(webhooks.sendWebhook).not.toHaveBeenCalled();
  });

  it.each([
    ["no context", null],
    ["a task's context", { ticketId: "t-1" }],
  ])("leaves jobs that aren't scheduled runs alone (%s)", async (_name, context) => {
    await completion.finish({ id: "job-2", context }, { status: "completed" });

    expect(executions.recordExecutionResult).not.toHaveBeenCalled();
  });

  it("doesn't throw when the run can't be recorded", async () => {
    executions.recordExecutionResult.mockRejectedValue(new Error("database down"));

    await expect(completion.finish(clawJob, { status: "completed" })).resolves.toBeUndefined();
  });
});
