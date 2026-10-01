import { TicketPhaseRunGuard } from "../../../services/TicketPhaseRunGuard";
import { TICKET_SERVICE_ERROR_CODE } from "../../../services/errors/TicketServiceError";

describe("TicketPhaseRunGuard", () => {
  const findActiveJobIdForTicket = jest.fn();
  const guard = new TicketPhaseRunGuard({ findActiveJobIdForTicket });

  beforeEach(() => {
    jest.resetAllMocks();
    findActiveJobIdForTicket.mockResolvedValue(null);
  });

  it("allows a change when no run is working on the task", async () => {
    await expect(guard.findConflict("ticket-1")).resolves.toBeNull();
    await expect(guard.assertIdle("ticket-1")).resolves.toBeUndefined();
    expect(findActiveJobIdForTicket).toHaveBeenCalledWith("ticket-1");
  });

  it("refuses while one of the task's runs is queued or running", async () => {
    findActiveJobIdForTicket.mockResolvedValue("job-1");

    await expect(guard.findConflict("ticket-1")).resolves.toBe(
      "The agent is working on this task. Wait for it to finish or cancel it first.",
    );
    await expect(guard.assertIdle("ticket-1")).rejects.toMatchObject({
      code: TICKET_SERVICE_ERROR_CODE.PHASE_RUN_IN_PROGRESS,
      statusCode: 409,
    });
  });
});
