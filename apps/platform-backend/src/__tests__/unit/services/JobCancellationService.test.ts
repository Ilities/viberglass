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
import type { WorkerStopper } from "../../../workers/WorkerStopper";

function stopper(stop: WorkerStopper["stop"], name = "test-stopper"): WorkerStopper {
  return { name, stop: jest.fn(stop) };
}

function serviceWith(...stoppers: WorkerStopper[]): JobCancellationService {
  return new JobCancellationService(undefined, undefined, undefined, stoppers);
}

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

    const result = await serviceWith().cancel("job-1", "user-1");

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

    await expect(serviceWith().cancel("job-1")).resolves.toBe("already_cancelled");
    expect(mockDb.updateTable).not.toHaveBeenCalled();
    expect(mockSessionDAO.update).not.toHaveBeenCalled();
  });

  it("stops the worker of a cancelled run", async () => {
    executeTakeFirst.mockResolvedValue({ status: "active", agent_session_id: null, agent_turn_id: null });
    const docker = stopper(async () => true);

    await expect(serviceWith(docker).cancel("job-1")).resolves.toBe("cancelled");

    expect(docker.stop).toHaveBeenCalledWith("job-1");
  });

  it("tries the next stopper when one has no worker for the run", async () => {
    executeTakeFirst.mockResolvedValue({ status: "active", agent_session_id: null, agent_turn_id: null });
    const first = stopper(async () => false, "first");
    const second = stopper(async () => true, "second");

    await serviceWith(first, second).cancel("job-1");

    expect(first.stop).toHaveBeenCalledWith("job-1");
    expect(second.stop).toHaveBeenCalledWith("job-1");
  });

  it("still cancels the run when stopping the worker fails", async () => {
    executeTakeFirst.mockResolvedValue({ status: "active", agent_session_id: null, agent_turn_id: null });
    const broken = stopper(async () => {
      throw new Error("docker socket unavailable");
    });

    await expect(serviceWith(broken).cancel("job-1")).resolves.toBe("cancelled");
    expect(setUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
  });

  it("does not stop anything for a run that already finished", async () => {
    executeTakeFirst.mockResolvedValue({ status: "completed", agent_session_id: null, agent_turn_id: null });
    const docker = stopper(async () => true);

    await expect(serviceWith(docker).cancel("job-1")).resolves.toBe("terminal");
    expect(docker.stop).not.toHaveBeenCalled();
    expect(mockDb.updateTable).not.toHaveBeenCalled();
  });

  describe("stopJob", () => {
    it("cancels the run and stops its worker without touching sessions", async () => {
      const docker = stopper(async () => true);

      await expect(serviceWith(docker).stopJob("job-1", "active")).resolves.toBe("cancelled");

      expect(docker.stop).toHaveBeenCalledWith("job-1");
      expect(mockEventDAO.create).not.toHaveBeenCalled();
      expect(mockSessionDAO.update).not.toHaveBeenCalled();
    });

    it("reports a missing run as not found", async () => {
      executeTakeFirst.mockResolvedValue(undefined);

      await expect(serviceWith().stopJob("job-404")).resolves.toBe("not_found");
    });
  });
});
