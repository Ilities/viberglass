const mockExecutionDAO = { finishExecution: jest.fn() };
const mockScheduleDAO = { incrementRunCount: jest.fn(), incrementFailureCount: jest.fn() };
jest.mock("../../../../persistence/claw/ClawExecutionDAO", () => ({
  ClawExecutionDAO: jest.fn(() => mockExecutionDAO),
}));
jest.mock("../../../../persistence/claw/ClawScheduleDAO", () => ({
  ClawScheduleDAO: jest.fn(() => mockScheduleDAO),
}));

import { ClawExecutionService } from "../../../../services/claw/ClawExecutionService";

describe("ClawExecutionService.recordExecutionResult", () => {
  const service = new ClawExecutionService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecutionDAO.finishExecution.mockResolvedValue({ id: "exec-1", scheduleId: "sched-1" });
  });

  it("counts a completed run as a run", async () => {
    await service.recordExecutionResult("exec-1", { status: "completed", jobId: "job-1" });

    expect(mockExecutionDAO.finishExecution).toHaveBeenCalledWith("exec-1", { status: "completed", jobId: "job-1" });
    expect(mockScheduleDAO.incrementRunCount).toHaveBeenCalledWith("sched-1");
    expect(mockScheduleDAO.incrementFailureCount).not.toHaveBeenCalled();
  });

  it("counts a failed run as a run and a failure", async () => {
    await service.recordExecutionResult("exec-1", { status: "failed", errorMessage: "boom" });

    expect(mockScheduleDAO.incrementRunCount).toHaveBeenCalledWith("sched-1");
    expect(mockScheduleDAO.incrementFailureCount).toHaveBeenCalledWith("sched-1");
  });

  it("counts a cancelled run as a run but not a failure", async () => {
    await service.recordExecutionResult("exec-1", { status: "cancelled" });

    expect(mockScheduleDAO.incrementRunCount).toHaveBeenCalledWith("sched-1");
    expect(mockScheduleDAO.incrementFailureCount).not.toHaveBeenCalled();
  });

  it("counts nothing for a run that had already ended", async () => {
    mockExecutionDAO.finishExecution.mockResolvedValue(null);

    await expect(service.recordExecutionResult("exec-1", { status: "failed" })).resolves.toBeNull();

    expect(mockScheduleDAO.incrementRunCount).not.toHaveBeenCalled();
    expect(mockScheduleDAO.incrementFailureCount).not.toHaveBeenCalled();
  });
});
