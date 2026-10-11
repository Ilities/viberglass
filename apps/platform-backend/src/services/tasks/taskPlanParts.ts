import { isPartFinished, planParts, type PartRange, type TaskPlanPart, type TaskPlanPartMark, type TaskPlanParts } from "@viberglass/types";
import type { TaskPullRequestRow } from "../../persistence/ticketing/TaskPullRequestDAO";

export const covers = (range: { first: number; last: number | null }, part: number) =>
  part >= range.first && (range.last === null || part <= range.last);

const rangeOf = (pullRequest: Pick<TaskPullRequestRow, "firstPart" | "lastPart">): PartRange => ({
  first: pullRequest.firstPart,
  last: pullRequest.lastPart,
});

/**
 * Where a plan stands, part by part, from the task's pull requests and the
 * parts someone marked done or skipped: a part is built by the latest pull
 * request covering it that wasn't closed unmerged. A merge counts over a mark,
 * and a pull request whose parts are all finished is no longer the open one.
 */
export function taskPlanParts(plan: string, pullRequests: TaskPullRequestRow[], marks: ReadonlyMap<number, TaskPlanPartMark> = new Map()): TaskPlanParts {
  const live = pullRequests.filter((pullRequest) => pullRequest.state !== "closed");
  const parts: TaskPlanPart[] = planParts(plan).map((part) => {
    const builtBy = live.filter((pullRequest) => covers(rangeOf(pullRequest), part.number)).at(-1);
    const fromPullRequest = !builtBy ? "not_built" : builtBy.state === "merged" ? "merged" : builtBy.url ? "open" : "building";
    const status = fromPullRequest === "merged" ? "merged" : (marks.get(part.number) ?? fromPullRequest);
    return { number: part.number, title: part.title, status, pullRequestUrl: builtBy?.url ?? null };
  });
  const unfinished = (pullRequest: TaskPullRequestRow) =>
    parts.some((part) => covers(rangeOf(pullRequest), part.number) && !isPartFinished(part.status));
  const openPullRequest = live.filter((pullRequest) => pullRequest.state !== "merged" && unfinished(pullRequest)).at(-1) ?? null;
  const open = openPullRequest ? rangeOf(openPullRequest) : null;
  const next = open ? null : (parts.find((part) => part.status === "not_built")?.number ?? null);
  // An open pull request through the plan's end has nothing left to take.
  const openEnd = open?.last ?? null;
  const addable = openEnd === null ? null : (parts.find((part) => part.number > openEnd && part.status === "not_built")?.number ?? null);
  return { parts, open, addable, next };
}
