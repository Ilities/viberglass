import { JobService } from "../../../services/JobService";

const mockRecord = jest.fn();
const mockJob = jest.fn();
jest.mock("../../../persistence/ticketing/TaskPullRequestDAO", () => ({
  TaskPullRequestDAO: jest.fn().mockImplementation(() => ({ record: (...args: unknown[]) => mockRecord(...args) })),
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

const RESULT = { success: true, changedFiles: [], executionTime: 1, branch: "viberator/t-1", pullRequestUrl: "https://github.com/acme/app/pull/7" };

describe("a finished build's pull request", () => {
  beforeEach(() => {
    mockRecord.mockReset();
    mockJob.mockReset();
    mockJob.mockResolvedValueOnce({ numUpdatedRows: 1n });
  });

  it("is recorded on the task, on the branch the build pushed", async () => {
    mockJob.mockResolvedValueOnce({ id: "job-1", ticket_id: "t-1", job_kind: "execution" });

    await new JobService().updateJobStatus("job-1", "completed", { result: RESULT });

    expect(mockRecord).toHaveBeenCalledWith("t-1", "viberator/t-1", "https://github.com/acme/app/pull/7");
  });

  it("isn't recorded for a build that failed", async () => {
    mockJob.mockResolvedValueOnce({ id: "job-1", ticket_id: "t-1", job_kind: "execution" });

    await new JobService().updateJobStatus("job-1", "failed", { result: { ...RESULT, success: false } });

    expect(mockRecord).not.toHaveBeenCalled();
  });
});
