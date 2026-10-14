import { JobService } from "../../../services/JobService";

const mockJob = jest.fn();
jest.mock("../../../persistence/ticketing/TaskPullRequestDAO", () => ({
  TaskPullRequestDAO: jest.fn().mockImplementation(() => ({ record: jest.fn() })),
}));
jest.mock("../../../persistence/ticketing/TicketDAO", () => ({
  TicketDAO: jest.fn().mockImplementation(() => ({ updateTicket: jest.fn() })),
}));
jest.mock("../../../services/TicketLifecycleStatusService", () => ({
  TicketLifecycleStatusService: jest.fn().mockImplementation(() => ({ synchronize: jest.fn() })),
}));
jest.mock("../../../services/tasks/TaskActivityRecorder", () => ({
  TaskActivityRecorder: jest.fn().mockImplementation(() => ({ record: jest.fn() })),
}));
jest.mock("../../../persistence/config/database", () => {
  const query = { where: () => query, set: () => query, select: () => query, executeTakeFirst: () => mockJob() };
  return { __esModule: true, default: { updateTable: () => query, selectFrom: () => query } };
});

const CLAW_JOB = { id: "claw-1", ticket_id: null, job_kind: "claw", context: { clawExecutionId: "exec-1" } };

describe("a scheduled run's job ending", () => {
  const scheduledRuns = { finish: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockJob.mockReset();
  });

  it("ends the scheduled run with the job's result when the job completes", async () => {
    mockJob.mockResolvedValueOnce({ numUpdatedRows: 1n }).mockResolvedValueOnce(CLAW_JOB);
    const result = { success: true, changedFiles: [], executionTime: 3 };

    await new JobService(scheduledRuns).updateJobStatus("claw-1", "completed", { result });

    expect(scheduledRuns.finish).toHaveBeenCalledWith(CLAW_JOB, { status: "completed", result, errorMessage: undefined });
  });

  it("ends the scheduled run as failed when a sweeper fails the job", async () => {
    mockJob.mockResolvedValueOnce({ numUpdatedRows: 1n }).mockResolvedValueOnce(CLAW_JOB);

    await new JobService(scheduledRuns).updateJobStatus("claw-1", "failed", { errorMessage: "Worker disappeared" });

    expect(scheduledRuns.finish).toHaveBeenCalledWith(CLAW_JOB, expect.objectContaining({ status: "failed", errorMessage: "Worker disappeared" }));
  });

  it("leaves the scheduled run running while its job is only starting", async () => {
    mockJob.mockResolvedValueOnce({ numUpdatedRows: 1n }).mockResolvedValueOnce(CLAW_JOB);

    await new JobService(scheduledRuns).updateJobStatus("claw-1", "active");

    expect(scheduledRuns.finish).not.toHaveBeenCalled();
  });

  it("does nothing when the job had already ended", async () => {
    mockJob.mockResolvedValueOnce({ numUpdatedRows: 0n });

    await new JobService(scheduledRuns).updateJobStatus("claw-1", "failed", { errorMessage: "late" });

    expect(scheduledRuns.finish).not.toHaveBeenCalled();
  });
});
