import { PausedRunRetryService } from "../../../../services/taskTurns/PausedRunRetryService";

describe("PausedRunRetryService", () => {
  it("tries again every task a setup failure paused, and none paused by people", async () => {
    const deps = {
      sessions: {
        listByStatuses: jest.fn().mockResolvedValue([
          { id: "s-1", ticketId: "t-setup" },
          { id: "s-2", ticketId: "t-setup" },
          { id: "s-3", ticketId: "t-by-hand" },
          { id: "s-4", ticketId: "t-agent" },
        ]),
      },
      facts: {
        lastFinished: jest.fn().mockResolvedValue(
          new Map([
            ["t-setup", { status: "failed", failure: { category: "setup", title: "Repository not reachable" } }],
            ["t-by-hand", { status: "cancelled", failure: null }],
            ["t-agent", { status: "failed", failure: { category: "agent" } }],
          ]),
        ),
      },
      steering: { resume: jest.fn().mockResolvedValue(true) },
    };
    const service = new PausedRunRetryService(deps);

    expect(await service.retryAll("u-admin")).toBe(1);
    expect(deps.sessions.listByStatuses).toHaveBeenCalledWith(["paused"]);
    expect(deps.steering.resume).toHaveBeenCalledTimes(1);
    expect(deps.steering.resume).toHaveBeenCalledWith("t-setup", "u-admin");
  });
});
