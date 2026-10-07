import { HANDED_BACK, TaskTakeoverService } from "../../../../services/tasks/TaskTakeoverService";

const BRANCH = { branch: "viberglass/t-1", repositoryUrl: "https://github.com/acme/web", baseBranch: "main", pushed: true, takenOver: null };

function setup(options: { takenOver?: boolean; paused?: boolean } = {}) {
  const deps = {
    steering: { pause: jest.fn().mockResolvedValue(undefined), resume: jest.fn().mockResolvedValue(options.paused ?? true) },
    turns: { ask: jest.fn().mockResolvedValue(undefined) },
    takeovers: {
      set: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(options.takenOver === false ? null : { by: { id: "u-dev", name: "Dev" }, at: "2026-10-02T10:00:00Z" }),
    },
    branches: { describe: jest.fn().mockResolvedValue(BRANCH) },
    activity: { record: jest.fn().mockResolvedValue(undefined) },
  };
  return { deps, service: new TaskTakeoverService(deps) };
}

describe("TaskTakeoverService", () => {
  it("takes over: pauses the agent, makes the work theirs and says where it is", async () => {
    const { deps, service } = setup();
    expect(await service.takeOver("t-1", "u-dev")).toEqual(BRANCH);
    expect(deps.steering.pause).toHaveBeenCalledWith("t-1", "u-dev");
    expect(deps.takeovers.set).toHaveBeenCalledWith("t-1", "u-dev");
    expect(deps.activity.record).toHaveBeenCalledWith("t-1", { type: "human", userId: "u-dev" }, "taken_over", { userId: "u-dev" });
  });

  it("doesn't take over when they may not steer the agent", async () => {
    const { deps, service } = setup();
    deps.steering.pause.mockRejectedValue(new Error("Only the task's owner…"));
    await expect(service.takeOver("t-1", "u-member")).rejects.toThrow("Only the task's owner");
    expect(deps.takeovers.set).not.toHaveBeenCalled();
  });

  it("hands back: the agent carries on with the person's note, and the work is the agent's again", async () => {
    const { deps, service } = setup();
    await service.handBack("t-1", "u-dev", "  Fixed the header; add a test  ");
    expect(deps.steering.resume).toHaveBeenCalledWith("t-1", "u-dev", "Fixed the header; add a test");
    expect(deps.turns.ask).not.toHaveBeenCalled();
    expect(deps.takeovers.clear).toHaveBeenCalledWith("t-1");
    expect(deps.activity.record).toHaveBeenCalledWith("t-1", { type: "human", userId: "u-dev" }, "handed_back", { userId: "u-dev" });
  });

  it("asks the agent with the note when nothing was paused, and says what was handed back without one", async () => {
    const { deps, service } = setup({ paused: false });
    await service.handBack("t-1", "u-dev", "");
    expect(deps.steering.resume).toHaveBeenCalledWith("t-1", "u-dev", HANDED_BACK);
    expect(deps.turns.ask).toHaveBeenCalledWith("t-1", "u-dev", { message: HANDED_BACK });
  });

  it("refuses to hand back work nobody took over", async () => {
    const { deps, service } = setup({ takenOver: false });
    await expect(service.handBack("t-1", "u-dev", "")).rejects.toThrow("Nobody has taken");
    expect(deps.steering.resume).not.toHaveBeenCalled();
  });
});
