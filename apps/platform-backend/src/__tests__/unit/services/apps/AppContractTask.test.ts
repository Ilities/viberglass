import { AppContractTask, CONTRACT_TASK_TITLE } from "../../../../services/apps/AppContractTask";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

function build() {
  const tickets = { createTicket: jest.fn(async () => ({ id: "task-1" })) };
  const turns = { ask: jest.fn(async () => ({})) };
  return { task: new AppContractTask(tickets, turns), tickets, turns };
}

describe("AppContractTask", () => {
  it("creates the task for whoever brought the space in and asks the default agent for the change", async () => {
    const { task, tickets, turns } = build();

    await expect(task.open("space-1", "u-1")).resolves.toEqual({ taskId: "task-1", warning: null });

    expect(tickets.createTicket).toHaveBeenCalledWith(expect.objectContaining({ projectId: "space-1", title: CONTRACT_TASK_TITLE, requesterId: "u-1" }));
    expect(turns.ask).toHaveBeenCalledWith("task-1", "u-1", expect.objectContaining({ action: "code", message: expect.stringContaining("viberglass.app.json") }));
  });

  it("keeps the task when the agent can't start, and says why", async () => {
    const { task, turns } = build();
    turns.ask.mockRejectedValue(new Error("This space has no default agent."));

    await expect(task.open("space-1", "u-1")).resolves.toEqual({
      taskId: "task-1",
      warning: expect.stringContaining("This space has no default agent."),
    });
  });
});
