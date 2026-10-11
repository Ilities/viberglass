import type { TaskPlanParts, TaskPlanPartStatus } from "@viberglass/types";
import type { TaskPullRequestRow } from "../../../../persistence/ticketing/TaskPullRequestDAO";
import { TaskPartMarksService } from "../../../../services/tasks/TaskPartMarksService";

const part = (number: number, status: TaskPlanPartStatus) => ({ number, title: null, status, pullRequestUrl: null });
const state = (statuses: TaskPlanPartStatus[], open: TaskPlanParts["open"] = null): TaskPlanParts => ({
  parts: statuses.map((status, index) => part(index + 1, status)),
  open,
  addable: null,
  next: null,
});
const UNOPENED: TaskPullRequestRow = { branch: "viberglass/t-1", url: null, firstPart: 1, lastPart: null, state: null, checkedAt: null };

function setup(options: { before?: TaskPlanParts; after?: TaskPlanParts; open?: TaskPullRequestRow | null; running?: boolean; status?: string } = {}) {
  const before = options.before ?? state(["merged", "not_built", "not_built"]);
  const deps = {
    tickets: {
      getTicket: jest.fn().mockResolvedValue({ id: "t-1", projectId: "p-1", status: options.status ?? "in_progress" }),
      updateTicket: jest.fn().mockResolvedValue(undefined),
      hasRunningJob: jest.fn().mockResolvedValue(options.running ?? false),
    },
    policy: { assertCanAsk: jest.fn().mockResolvedValue(undefined) },
    parts: {
      read: jest
        .fn()
        .mockResolvedValueOnce({ state: before, open: options.open ?? null })
        .mockResolvedValue({ state: options.after ?? before, open: options.open ?? null }),
    },
    marks: { set: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined) },
    pullRequests: { discardUnopened: jest.fn().mockResolvedValue(true) },
    activity: { record: jest.fn().mockResolvedValue(undefined) },
    lifecycle: { synchronize: jest.fn().mockResolvedValue("in_review") },
  };
  return { deps, service: new TaskPartMarksService(deps) };
}

describe("TaskPartMarksService", () => {
  it("marks a part done, as whoever may ask for a build, and says so in the activity", async () => {
    const { deps, service } = setup();

    await service.mark("t-1", "maria", 2, "done");

    expect(deps.policy.assertCanAsk).toHaveBeenCalledWith("maria", "t-1", "code");
    expect(deps.marks.set).toHaveBeenCalledWith("t-1", 2, "done", "maria");
    expect(deps.activity.record).toHaveBeenCalledWith("t-1", { type: "human", userId: "maria" }, "part_marked", { part: 2, mark: "done" });
    expect(deps.tickets.updateTicket).not.toHaveBeenCalled();
  });

  it("finishes the task when the mark finishes every part", async () => {
    const { deps, service } = setup({ before: state(["merged", "done", "not_built"]), after: state(["merged", "done", "skipped"]) });

    await service.mark("t-1", "maria", 3, "skipped");

    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("t-1", { status: "resolved" });
    expect(deps.activity.record).toHaveBeenCalledWith("t-1", { type: "human", userId: "maria" }, "task_done");
  });

  it("refuses a part that is merged, or not in the plan", async () => {
    await expect(setup().service.mark("t-1", "maria", 1, "done")).rejects.toThrow("merged already");
    await expect(setup().service.mark("t-1", "maria", 7, "done")).rejects.toThrow("no part 7");
  });

  it("refuses someone who may not ask for a build", async () => {
    const { deps, service } = setup();
    deps.policy.assertCanAsk.mockRejectedValue(new Error("Only people on the task…"));

    await expect(service.mark("t-1", "viewer", 2, "skipped")).rejects.toThrow("Only people");
    expect(deps.marks.set).not.toHaveBeenCalled();
  });

  it("takes a mark back", async () => {
    const { deps, service } = setup();

    await service.unmark("t-1", "maria", 2);

    expect(deps.marks.clear).toHaveBeenCalledWith("t-1", 2);
    expect(deps.activity.record).toHaveBeenCalledWith("t-1", { type: "human", userId: "maria" }, "part_unmarked", { part: 2 });
    expect(deps.tickets.updateTicket).not.toHaveBeenCalled();
  });

  it("opens a finished task again when a mark is taken back", async () => {
    const { deps, service } = setup({ status: "resolved" });

    await service.unmark("t-1", "maria", 3);

    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("t-1", { status: "open" });
    expect(deps.lifecycle.synchronize).toHaveBeenCalledWith("t-1");
    expect(deps.activity.record).toHaveBeenCalledWith("t-1", { type: "human", userId: "maria" }, "part_unmarked", { part: 3, reopened: true });
  });

  it("discards a build that never opened its pull request", async () => {
    const { deps, service } = setup({ before: state(["building", "building", "building"], { first: 1, last: null }), open: UNOPENED });

    await service.discardBuild("t-1", "maria");

    expect(deps.pullRequests.discardUnopened).toHaveBeenCalledWith("t-1", "viberglass/t-1");
    expect(deps.activity.record).toHaveBeenCalledWith("t-1", { type: "human", userId: "maria" }, "build_discarded", { parts: "the plan" });
  });

  it("won't discard a build while a run is going, or one that opened its pull request", async () => {
    const running = setup({ before: state(["building", "building", "building"], { first: 1, last: null }), open: UNOPENED, running: true });
    await expect(running.service.discardBuild("t-1", "maria")).rejects.toThrow("still going");
    expect(running.deps.pullRequests.discardUnopened).not.toHaveBeenCalled();

    const opened = setup({ before: state(["open", "open", "open"], { first: 1, last: null }), open: { ...UNOPENED, url: "u1" } });
    await expect(opened.service.discardBuild("t-1", "maria")).rejects.toThrow("no build without a pull request");
  });
});
