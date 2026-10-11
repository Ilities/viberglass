import type { TaskPlanParts } from "@viberglass/types";
import { TaskMergeCompleter } from "../../../../services/pull-request-outcomes/TaskMergeCompleter";
import type { PullRequestOutcome } from "@viberglass/types";

const URL_1 = "https://github.com/acme/app/pull/1";
const MERGED: PullRequestOutcome = { state: "merged", mergedAt: new Date(), closedAt: new Date(), commentCount: 0, reviewCommentCount: 0, mergedBy: "dev-koskinen" };

function setup(state: TaskPlanParts) {
  const deps = {
    tasks: { listOpenTaskIds: jest.fn().mockResolvedValue(["task-1"]) },
    tickets: { getTicket: jest.fn().mockResolvedValue({ id: "task-1", projectId: "p-1" }), updateTicket: jest.fn() },
    parts: { state: jest.fn().mockResolvedValue(state) },
    activity: { record: jest.fn() },
  };
  return { deps, completer: new TaskMergeCompleter(deps) };
}

describe("TaskMergeCompleter", () => {
  it("closes a task whose plan has no parts once its pull request merges", async () => {
    const { deps, completer } = setup({ parts: [], open: null, addable: null, next: null });

    await completer.onOutcome(URL_1, MERGED);

    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("task-1", { status: "resolved" });
    expect(deps.activity.record).toHaveBeenCalledWith("task-1", { type: "system" }, "pull_request_merged", {
      pullRequestUrl: URL_1,
      merged: true,
      mergedBy: "dev-koskinen",
    });
  });

  it("closes the task when the merge finishes every part", async () => {
    const { deps, completer } = setup({
      parts: [
        { number: 1, title: "A", status: "merged", pullRequestUrl: "https://github.com/acme/app/pull/0" },
        { number: 2, title: "B", status: "merged", pullRequestUrl: URL_1 },
      ],
      open: null,
      addable: null,
      next: null,
    });

    await completer.onOutcome(URL_1, MERGED);

    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("task-1", { status: "resolved" });
  });

  it("closes the task when the parts the merge leaves were done or skipped another way", async () => {
    const { deps, completer } = setup({
      parts: [
        { number: 1, title: "A", status: "merged", pullRequestUrl: URL_1 },
        { number: 2, title: "B", status: "skipped", pullRequestUrl: null },
        { number: 3, title: "C", status: "done", pullRequestUrl: null },
      ],
      open: null,
      addable: null,
      next: null,
    });

    await completer.onOutcome(URL_1, MERGED);

    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("task-1", { status: "resolved" });
  });

  it("leaves the task open and says which part is next when parts remain", async () => {
    const { deps, completer } = setup({
      parts: [
        { number: 1, title: "A", status: "merged", pullRequestUrl: URL_1 },
        { number: 2, title: "B", status: "not_built", pullRequestUrl: null },
      ],
      open: null,
      addable: null,
      next: 2,
    });

    await completer.onOutcome(URL_1, MERGED);

    expect(deps.tickets.updateTicket).not.toHaveBeenCalled();
    expect(deps.activity.record).toHaveBeenCalledWith("task-1", { type: "system" }, "part_merged", {
      pullRequestUrl: URL_1,
      parts: [1],
      next: 2,
      mergedBy: "dev-koskinen",
    });
  });

  it("does nothing for a pull request that is still open or was closed unmerged", async () => {
    const { deps, completer } = setup({ parts: [], open: null, addable: null, next: null });

    await completer.onOutcome(URL_1, { ...MERGED, state: "open", mergedAt: null });
    await completer.onOutcome(URL_1, { ...MERGED, state: "closed", mergedAt: null });

    expect(deps.tasks.listOpenTaskIds).not.toHaveBeenCalled();
    expect(deps.tickets.updateTicket).not.toHaveBeenCalled();
  });
});
