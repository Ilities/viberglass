import { planParts, type PartRange, type TaskPlanPart, type TaskPlanParts } from "@viberglass/types";
import type { TaskPullRequestRow } from "../../persistence/ticketing/TaskPullRequestDAO";

const covers = (pullRequest: Pick<TaskPullRequestRow, "firstPart" | "lastPart">, part: number) =>
  part >= pullRequest.firstPart && (pullRequest.lastPart === null || part <= pullRequest.lastPart);

/**
 * Where a plan stands, part by part, from the task's pull requests: a part
 * is built by the latest pull request covering it that wasn't closed unmerged.
 */
export function taskPlanParts(plan: string, pullRequests: TaskPullRequestRow[]): TaskPlanParts {
  const live = pullRequests.filter((pullRequest) => pullRequest.state !== "closed");
  const openPullRequest = live.filter((pullRequest) => pullRequest.state !== "merged").at(-1) ?? null;
  const parts: TaskPlanPart[] = planParts(plan).map((part) => {
    const builtBy = live.filter((pullRequest) => covers(pullRequest, part.number)).at(-1);
    const status = !builtBy ? "not_built" : builtBy.state === "merged" ? "merged" : builtBy.url ? "open" : "building";
    return { number: part.number, title: part.title, status, pullRequestUrl: builtBy?.url ?? null };
  });
  const open: PartRange | null = openPullRequest ? { first: openPullRequest.firstPart, last: openPullRequest.lastPart } : null;
  const next = open ? null : (parts.find((part) => part.status === "not_built")?.number ?? null);
  return { parts, open, next };
}
