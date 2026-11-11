import type { PullRequestOutcome } from "@viberglass/types";
import type { TaskPullRequestRow } from "../../../../persistence/ticketing/TaskPullRequestDAO";
import { TaskUnmergedCloser } from "../../../../services/pull-request-outcomes/TaskUnmergedCloser";

const URL_1 = "https://github.com/acme/app/pull/1";
const CLOSED_AT = new Date("2026-11-11T14:36:00Z");
const CLOSED: PullRequestOutcome = { state: "closed", mergedAt: null, closedAt: CLOSED_AT, commentCount: 1, reviewCommentCount: 0 };

const pullRequest = (overrides: Partial<TaskPullRequestRow> = {}): TaskPullRequestRow => ({
  branch: "viberglass/web-3",
  url: URL_1,
  firstPart: 1,
  lastPart: null,
  state: "closed",
  checkedAt: CLOSED_AT,
  ...overrides,
});

function setup(pullRequests: TaskPullRequestRow[] = [pullRequest()]) {
  const deps = {
    pullRequests: { listOpenTaskIds: jest.fn().mockResolvedValue(["task-1"]), listWithStates: jest.fn().mockResolvedValue(pullRequests) },
    turns: { running: jest.fn().mockResolvedValue(new Map()), lastFinished: jest.fn().mockResolvedValue(new Map()) },
    tickets: { updateTicket: jest.fn() },
    activity: { record: jest.fn() },
  };
  return { deps, closer: new TaskUnmergedCloser(deps) };
}

describe("TaskUnmergedCloser", () => {
  it("finishes a task whose only pull request was closed without merging", async () => {
    const { deps, closer } = setup();

    await closer.onOutcome(URL_1, CLOSED);

    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("task-1", { status: "resolved" });
    expect(deps.activity.record).toHaveBeenCalledWith("task-1", { type: "system" }, "pull_request_closed", {
      pullRequestUrl: URL_1,
      closedUnmerged: true,
    });
  });

  it("leaves open and merged pull requests to the others", async () => {
    const { deps, closer } = setup();

    await closer.onOutcome(URL_1, { ...CLOSED, state: "open", closedAt: null });
    await closer.onOutcome(URL_1, { ...CLOSED, state: "merged", mergedAt: CLOSED_AT });

    expect(deps.pullRequests.listOpenTaskIds).not.toHaveBeenCalled();
    expect(deps.tickets.updateTicket).not.toHaveBeenCalled();
  });

  it.each([
    ["another pull request still open", pullRequest({ branch: "viberglass/web-3-2", url: "https://github.com/acme/app/pull/2", state: "open" })],
    ["another pull request not checked yet", pullRequest({ branch: "viberglass/web-3-2", url: "https://github.com/acme/app/pull/2", state: null })],
    ["a build that hasn't opened its pull request yet", pullRequest({ branch: "viberglass/web-3-2", url: null, state: null })],
  ])("keeps the task open with %s", async (_case, other) => {
    const { deps, closer } = setup([pullRequest(), other]);

    await closer.onOutcome(URL_1, CLOSED);

    expect(deps.tickets.updateTicket).not.toHaveBeenCalled();
    expect(deps.activity.record).not.toHaveBeenCalled();
  });

  it("finishes it when its other pull requests are merged or closed", async () => {
    const { deps, closer } = setup([pullRequest({ branch: "viberglass/web-3-0", url: "https://github.com/acme/app/pull/0", state: "merged" }), pullRequest()]);

    await closer.onOutcome(URL_1, CLOSED);

    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("task-1", { status: "resolved" });
  });

  it("keeps the task open while the agent is working on it", async () => {
    const { deps, closer } = setup();
    deps.turns.running.mockResolvedValue(new Map([["task-1", { action: "reply", since: new Date() }]]));

    await closer.onOutcome(URL_1, CLOSED);

    expect(deps.tickets.updateTicket).not.toHaveBeenCalled();
  });

  it("keeps the task open when the agent worked on it after the close", async () => {
    const { deps, closer } = setup();
    deps.turns.lastFinished.mockResolvedValue(new Map([["task-1", { at: new Date(CLOSED_AT.getTime() + 60_000) }]]));

    await closer.onOutcome(URL_1, CLOSED);

    expect(deps.tickets.updateTicket).not.toHaveBeenCalled();
  });

  it("finishes it when the agent's last turn came before the close", async () => {
    const { deps, closer } = setup();
    deps.turns.lastFinished.mockResolvedValue(new Map([["task-1", { at: new Date(CLOSED_AT.getTime() - 60_000) }]]));

    await closer.onOutcome(URL_1, CLOSED);

    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("task-1", { status: "resolved" });
  });
});
