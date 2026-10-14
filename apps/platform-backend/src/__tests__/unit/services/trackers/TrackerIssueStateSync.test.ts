import { TICKET_STATUS, type TicketLifecycleStatus } from "@viberglass/types";
import { TaskDoneService } from "../../../../services/tasks/TaskDoneService";
import { TrackerIssueStateSync } from "../../../../services/trackers/TrackerIssueStateSync";

function setup(statuses: Record<string, TicketLifecycleStatus>) {
  const deps = {
    tickets: {
      getTicket: jest.fn().mockImplementation(async (id: string) => (statuses[id] ? { id, status: statuses[id] } : null)),
      updateTicket: jest.fn(),
    },
    lifecycle: { synchronize: jest.fn() },
    activity: { record: jest.fn() },
  };
  return { deps, sync: new TrackerIssueStateSync({ done: new TaskDoneService(deps) }) };
}

describe("TrackerIssueStateSync", () => {
  it("marks each open task done when the issue closes, naming the tracker in its Activity", async () => {
    const { deps, sync } = setup({ open: TICKET_STATUS.IN_REVIEW, done: TICKET_STATUS.RESOLVED });

    await sync.apply("jira", ["open", "done", "gone"], "closed");

    expect(deps.tickets.updateTicket).toHaveBeenCalledTimes(1);
    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("open", { status: TICKET_STATUS.RESOLVED });
    expect(deps.activity.record).toHaveBeenCalledTimes(1);
    expect(deps.activity.record).toHaveBeenCalledWith("open", { type: "system" }, "task_done", { source: "jira" });
  });

  it("reopens only the tasks that are done when the issue reopens", async () => {
    const { deps, sync } = setup({ open: TICKET_STATUS.OPEN, done: TICKET_STATUS.RESOLVED });

    await sync.apply("jira", ["open", "done"], "reopened");

    expect(deps.tickets.updateTicket).toHaveBeenCalledTimes(1);
    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("done", { status: TICKET_STATUS.OPEN });
    expect(deps.lifecycle.synchronize).toHaveBeenCalledWith("done");
    expect(deps.activity.record).toHaveBeenCalledWith("done", { type: "system" }, "task_reopened", { source: "jira" });
  });
});
