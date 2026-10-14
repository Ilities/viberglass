import { TICKET_STATUS } from "@viberglass/types";
import type { TaskChanger } from "../../../../services/tasks/TaskChangePolicyService";
import { TaskDoneService } from "../../../../services/tasks/TaskDoneService";

const PERSON: TaskChanger = { id: "u-1", role: "member" };

function setup(status: string = TICKET_STATUS.OPEN) {
  const deps = {
    tickets: {
      getTicket: jest.fn().mockResolvedValue({ id: "t-1", status }),
      updateTicket: jest.fn().mockResolvedValue(undefined),
    },
    lifecycle: { synchronize: jest.fn().mockResolvedValue(TICKET_STATUS.IN_REVIEW) },
    access: { assertCanSeeTask: jest.fn().mockResolvedValue(undefined) },
    policy: { assertCanChange: jest.fn().mockResolvedValue(undefined) },
    activity: { record: jest.fn().mockResolvedValue(undefined) },
  };
  return { deps, service: new TaskDoneService(deps) };
}

describe("TaskDoneService", () => {
  it("marks the task done for someone who may change it, and records it", async () => {
    const { deps, service } = setup();
    await service.markDone("t-1", PERSON);
    expect(deps.access.assertCanSeeTask).toHaveBeenCalledWith("t-1", "u-1");
    expect(deps.policy.assertCanChange).toHaveBeenCalledWith(PERSON, "t-1", "edit");
    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("t-1", { status: TICKET_STATUS.RESOLVED });
    expect(deps.activity.record).toHaveBeenCalledWith("t-1", { type: "human", userId: "u-1" }, "task_done", {});
  });

  it("changes nothing for someone who may not change the task", async () => {
    const { deps, service } = setup();
    deps.policy.assertCanChange.mockRejectedValue(new Error("Only this task's requester and owner can change it."));
    await expect(service.markDone("t-1", PERSON)).rejects.toThrow("requester and owner");
    expect(deps.tickets.updateTicket).not.toHaveBeenCalled();
  });

  it("leaves a task that's done already as it is", async () => {
    const { deps, service } = setup(TICKET_STATUS.RESOLVED);
    await service.markDone("t-1", PERSON);
    expect(deps.tickets.updateTicket).not.toHaveBeenCalled();
    expect(deps.activity.record).not.toHaveBeenCalled();
  });

  it("opens a done task again at the status its work puts it in, and records it", async () => {
    const { deps, service } = setup(TICKET_STATUS.RESOLVED);
    expect(await service.reopen("t-1", { type: "system" }, { source: "jira" })).toBe(true);
    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("t-1", { status: TICKET_STATUS.OPEN });
    expect(deps.lifecycle.synchronize).toHaveBeenCalledWith("t-1");
    expect(deps.activity.record).toHaveBeenCalledWith("t-1", { type: "system" }, "task_reopened", { source: "jira" });
  });

  it("leaves an open task alone when asked to reopen it", async () => {
    const { deps, service } = setup(TICKET_STATUS.OPEN);
    expect(await service.reopen("t-1", { type: "system" })).toBe(false);
    expect(deps.tickets.updateTicket).not.toHaveBeenCalled();
  });
});
