import { TicketPhaseRunGuard } from "../../../services/TicketPhaseRunGuard";
import {
  TICKET_SERVICE_ERROR_CODE,
  TicketServiceError,
} from "../../../services/errors/TicketServiceError";

describe("TicketPhaseRunGuard", () => {
  const findActiveJobId = jest.fn();
  const getActiveByTicketAndMode = jest.fn();
  const guard = new TicketPhaseRunGuard(
    { findActiveJobId },
    { getActiveByTicketAndMode },
  );

  beforeEach(() => {
    jest.resetAllMocks();
    findActiveJobId.mockResolvedValue(null);
    getActiveByTicketAndMode.mockResolvedValue(null);
  });

  it("allows a run when nothing is working on the phase", async () => {
    await expect(guard.findConflict("ticket-1", "research")).resolves.toBeNull();
    await expect(guard.assertIdle("ticket-1", "research")).resolves.toBeUndefined();
    expect(findActiveJobId).toHaveBeenCalledWith("ticket-1", "research");
    expect(getActiveByTicketAndMode).toHaveBeenCalledWith("ticket-1", "research");
  });

  it("refuses while a job for the phase is queued or running", async () => {
    findActiveJobId.mockResolvedValue("job-1");

    await expect(guard.findConflict("ticket-1", "planning")).resolves.toBe(
      "A planning run is already in progress for this ticket. Wait for it to finish or cancel it first.",
    );
    await expect(guard.assertIdle("ticket-1", "planning")).rejects.toMatchObject({
      code: TICKET_SERVICE_ERROR_CODE.PHASE_RUN_IN_PROGRESS,
      statusCode: 409,
    });
  });

  it("names the live session rather than its turn job when both exist", async () => {
    getActiveByTicketAndMode.mockResolvedValue({ id: "session-1" });
    findActiveJobId.mockResolvedValue("job-1");

    const error = await guard.assertIdle("ticket-1", "execution").catch((e) => e);

    expect(error).toBeInstanceOf(TicketServiceError);
    expect(error.message).toBe(
      "A live execution session is already open for this ticket. Continue it or end it first.",
    );
  });
});
