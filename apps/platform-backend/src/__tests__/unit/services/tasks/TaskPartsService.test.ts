import type { TaskPullRequestRow } from "../../../../persistence/ticketing/TaskPullRequestDAO";
import { TaskTurnError } from "../../../../services/errors/TaskTurnError";
import { TaskPartsService } from "../../../../services/tasks/TaskPartsService";
import { taskPlanParts } from "../../../../services/tasks/taskPlanParts";

const PLAN = "# Plan\n\n## Part 1: Store it\nA.\n\n## Part 2: Show it\nB.\n\n## Part 3: Print it\nC.";
const TICKET = { id: "t-1", projectId: "p-1" };

function pullRequest(overrides: Partial<TaskPullRequestRow>): TaskPullRequestRow {
  return { branch: "b", url: "https://github.com/acme/app/pull/1", firstPart: 1, lastPart: null, state: "open", checkedAt: new Date(), ...overrides };
}

describe("taskPlanParts", () => {
  it("has every part not built, and the first next, before any pull request", () => {
    expect(taskPlanParts(PLAN, [])).toEqual({
      parts: [
        { number: 1, title: "Store it", status: "not_built", pullRequestUrl: null },
        { number: 2, title: "Show it", status: "not_built", pullRequestUrl: null },
        { number: 3, title: "Print it", status: "not_built", pullRequestUrl: null },
      ],
      open: null,
      next: 1,
    });
  });

  it("reads each part's state from the pull request that builds it", () => {
    const state = taskPlanParts(PLAN, [
      pullRequest({ url: "u1", firstPart: 1, lastPart: 1, state: "merged" }),
      pullRequest({ url: null, firstPart: 2, lastPart: 2, state: null }),
    ]);
    expect(state.parts.map((part) => part.status)).toEqual(["merged", "building", "not_built"]);
    expect(state.open).toEqual({ first: 2, last: 2 });
    expect(state.next).toBeNull();
  });

  it("has an open pull request's parts open, and nothing next while it is", () => {
    const state = taskPlanParts(PLAN, [pullRequest({ url: "u1", firstPart: 1, lastPart: 2, state: "open" })]);
    expect(state.parts.map((part) => [part.status, part.pullRequestUrl])).toEqual([
      ["open", "u1"],
      ["open", "u1"],
      ["not_built", null],
    ]);
    expect(state.next).toBeNull();
  });

  it("doesn't count a pull request closed unmerged", () => {
    const state = taskPlanParts(PLAN, [
      pullRequest({ url: "u1", firstPart: 1, lastPart: 1, state: "merged" }),
      pullRequest({ url: "u2", firstPart: 2, lastPart: 2, state: "closed" }),
    ]);
    expect(state.parts.map((part) => part.status)).toEqual(["merged", "not_built", "not_built"]);
    expect(state).toMatchObject({ open: null, next: 2 });
  });
});

describe("TaskPartsService", () => {
  function setup(plan: string, rows: TaskPullRequestRow[], after: TaskPullRequestRow[] = rows) {
    const deps = {
      documents: { getByTicketAndPhase: jest.fn().mockResolvedValue({ content: plan }) },
      pullRequests: { listWithStates: jest.fn().mockResolvedValueOnce(rows).mockResolvedValue(after) },
      checker: { check: jest.fn().mockResolvedValue(null) },
    };
    const service = new TaskPartsService({ documents: deps.documents, pullRequests: deps.pullRequests, checker: () => deps.checker });
    return { deps, service };
  }

  it("re-reads a stale open pull request when asked for a fresh state, so a merge just made counts", async () => {
    const stale = pullRequest({ url: "u1", firstPart: 1, lastPart: 1, checkedAt: new Date(Date.now() - 120_000) });
    const { deps, service } = setup(PLAN, [stale], [{ ...stale, state: "merged" }]);

    const state = await service.state(TICKET, { fresh: true });

    expect(deps.checker.check).toHaveBeenCalledWith("u1", "p-1");
    expect(state.next).toBe(2);
  });

  it("doesn't re-read a pull request checked a moment ago, nor without being asked", async () => {
    const recent = pullRequest({ url: "u1", firstPart: 1, lastPart: 1 });
    const { deps, service } = setup(PLAN, [recent]);
    await service.state(TICKET, { fresh: true });
    await service.state(TICKET);
    expect(deps.checker.check).not.toHaveBeenCalled();
  });

  describe("resolveBuild", () => {
    it("continues the open pull request when no parts are asked for, or its own parts are", async () => {
      const open = [pullRequest({ firstPart: 1, lastPart: 1 })];
      await expect(setup(PLAN, open).service.resolveBuild(TICKET, null)).resolves.toBeNull();
      await expect(setup(PLAN, open).service.resolveBuild(TICKET, { first: 1, last: 1 })).resolves.toBeNull();
    });

    it("refuses a new part while an earlier part's pull request isn't merged", async () => {
      const { service } = setup(PLAN, [pullRequest({ firstPart: 1, lastPart: 1 })]);
      await expect(service.resolveBuild(TICKET, { first: 2, last: 2 })).rejects.toThrow("Part 1's pull request isn't merged yet");
    });

    it("builds a plan in one part, or none, as a whole", async () => {
      await expect(setup("# Plan\n\nFix it.", []).service.resolveBuild(TICKET, null)).resolves.toEqual({ first: 1, last: null });
      await expect(setup("", []).service.resolveBuild(TICKET, null)).resolves.toEqual({ first: 1, last: null });
    });

    it("builds what's left when no parts are asked for", async () => {
      const { service } = setup(PLAN, [pullRequest({ firstPart: 1, lastPart: 1, state: "merged" })]);
      await expect(service.resolveBuild(TICKET, null)).resolves.toEqual({ first: 2, last: null });
    });

    it("builds parts in order", async () => {
      const { service } = setup(PLAN, []);
      const refused = service.resolveBuild(TICKET, { first: 2, last: 2 });
      await expect(refused).rejects.toBeInstanceOf(TaskTurnError);
      await expect(refused).rejects.toThrow("Part 1 is next: parts are built in order.");
    });

    it("takes a range to the plan's last part as through the end, and refuses one past it", async () => {
      await expect(setup(PLAN, []).service.resolveBuild(TICKET, { first: 1, last: 3 })).resolves.toEqual({ first: 1, last: null });
      await expect(setup(PLAN, []).service.resolveBuild(TICKET, { first: 1, last: 2 })).resolves.toEqual({ first: 1, last: 2 });
      await expect(setup(PLAN, []).service.resolveBuild(TICKET, { first: 1, last: 4 })).rejects.toThrow("The plan's parts go from 1 to 3.");
    });

    it("refuses a build once every part is built", async () => {
      const { service } = setup(PLAN, [pullRequest({ firstPart: 1, lastPart: null, state: "merged" })]);
      await expect(service.resolveBuild(TICKET, null)).rejects.toThrow("Every part of the plan is built already.");
    });
  });
});
