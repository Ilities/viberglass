const executeTakeFirst = jest.fn();
const executeUpdate = jest.fn();
const secondWhere = jest.fn(() => ({ execute: executeUpdate }));
const firstWhere = jest.fn(() => ({ where: secondWhere }));
const setUpdate = jest.fn(() => ({ where: firstWhere }));

const mockDb = {
  selectFrom: jest.fn(() => ({
    select: jest.fn(() => ({
      where: jest.fn(() => ({ executeTakeFirst })),
    })),
  })),
  updateTable: jest.fn(() => ({ set: setUpdate })),
};

const mockSessionDAO = { getById: jest.fn(), update: jest.fn() };
const mockTurnDAO = { update: jest.fn() };
const mockEventDAO = { getMaxSequence: jest.fn(), create: jest.fn() };

jest.mock("../../../persistence/config/database", () => ({
  __esModule: true,
  default: mockDb,
}));
jest.mock("../../../persistence/agentSession/AgentSessionDAO", () => ({
  AgentSessionDAO: jest.fn(() => mockSessionDAO),
}));
jest.mock("../../../persistence/agentSession/AgentTurnDAO", () => ({
  AgentTurnDAO: jest.fn(() => mockTurnDAO),
}));
jest.mock("../../../persistence/agentSession/AgentSessionEventDAO", () => ({
  AgentSessionEventDAO: jest.fn(() => mockEventDAO),
}));

import { JobCancellationService } from "../../../services/job/JobCancellationService";

describe("JobCancellationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEventDAO.getMaxSequence.mockResolvedValue(3);
    mockSessionDAO.getById.mockResolvedValue({ id: "session-1", status: "active" });
  });

  it("retains and marks a run and its live session as cancelled", async () => {
    executeTakeFirst.mockResolvedValue({
      status: "active",
      agent_session_id: "session-1",
      agent_turn_id: "turn-1",
    });

    const result = await new JobCancellationService().cancel("job-1", "user-1");

    expect(result).toBe("cancelled");
    expect(mockDb.updateTable).toHaveBeenCalledWith("jobs");
    expect(setUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", error_message: "Run cancelled by user" }),
    );
    expect(mockTurnDAO.update).toHaveBeenCalledWith("turn-1", { status: "cancelled" });
    expect(mockEventDAO.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        sequence: 4,
        eventType: "session_cancelled",
        payloadJson: { cancelledBy: "user-1", jobId: "job-1" },
      }),
    );
    expect(mockSessionDAO.update).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ status: "cancelled" }),
    );
  });

  it("is idempotent for a previously cancelled run", async () => {
    executeTakeFirst.mockResolvedValue({
      status: "cancelled",
      agent_session_id: "session-1",
      agent_turn_id: "turn-1",
    });

    await expect(new JobCancellationService().cancel("job-1")).resolves.toBe("already_cancelled");
    expect(mockDb.updateTable).not.toHaveBeenCalled();
    expect(mockSessionDAO.update).not.toHaveBeenCalled();
  });
});
