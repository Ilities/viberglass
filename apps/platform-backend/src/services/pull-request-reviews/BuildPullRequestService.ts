import type { BuildPullRequest, RecordedPullRequest, TaskPullRequest, Ticket } from "@viberglass/types";
import type { TaskBuildDAO } from "../../persistence/job/TaskBuildDAO";
import type { PullRequestOutcomeDAO } from "../../persistence/job/PullRequestOutcomeDAO";
import type { TaskPullRequestDAO } from "../../persistence/ticketing/TaskPullRequestDAO";
import type { ProjectRepositoryResolver } from "../repositories/ProjectRepositoryResolver";

/** Who is reading: only people who can change the space's repository connection hear what's missing from it. */
export interface PullRequestReader {
  canConfigure: boolean;
}

const MAINTAINER: PullRequestReader = { canConfigure: true };

/**
 * A task's pull requests as the space's code host has them, with their open review comments:
 * what the Code tab shows, and what "ask for changes" sends to the agent with
 * the reviewer's note. Never throws; a pull request that can't be read says
 * why instead, and shows what was last recorded about it.
 */
export class BuildPullRequestService {
  constructor(
    private readonly repositories: Pick<ProjectRepositoryResolver, "resolve">,
    private readonly builds: Pick<TaskBuildDAO, "lastBuildFinishedAt">,
    private readonly pullRequests: Pick<TaskPullRequestDAO, "listForTask">,
    private readonly outcomes: Pick<PullRequestOutcomeDAO, "recordedFor">,
  ) {}

  /** The task's latest pull request, which its next build continues. */
  async forTask(ticket: Pick<Ticket, "id" | "projectId" | "pullRequestUrl">): Promise<BuildPullRequest> {
    return this.read(ticket, ticket.pullRequestUrl ?? null, MAINTAINER);
  }

  /** Every pull request the task's builds opened, oldest first. */
  async listForTask(ticket: Pick<Ticket, "id" | "projectId">, reader: PullRequestReader): Promise<TaskPullRequest[]> {
    const pullRequests = await this.pullRequests.listForTask(ticket.id);
    const read = await Promise.all(pullRequests.map(async (pullRequest) => ({ pullRequest, review: await this.read(ticket, pullRequest.url, reader) })));
    const unread = read.filter(({ review }) => !review.details).map(({ pullRequest }) => pullRequest.url);
    const recorded = await this.outcomes.recordedFor(unread).catch(() => new Map<string, RecordedPullRequest>());
    return read.map(({ pullRequest, review }) => ({
      ...review,
      recorded: recorded.get(pullRequest.url) ?? null,
      pullRequestUrl: pullRequest.url,
      branch: pullRequest.branch,
      firstPart: pullRequest.firstPart,
      lastPart: pullRequest.lastPart,
    }));
  }

  private async read(ticket: Pick<Ticket, "id" | "projectId">, pullRequestUrl: string | null, reader: PullRequestReader): Promise<BuildPullRequest> {
    const unavailable = (reason: string | null): BuildPullRequest => ({ pullRequestUrl, details: null, comments: [], unavailableReason: reason, recorded: null });

    if (!pullRequestUrl) return unavailable("This task has no pull request yet");

    try {
      const repository = await this.repositories.resolve(ticket.projectId);
      if ("unavailable" in repository) {
        return unavailable(reader.canConfigure ? `Live details from the code host need a working repository connection: ${lowerFirst(repository.unavailable)}` : null);
      }
      if (!repository.host.ownsPullRequest(pullRequestUrl)) {
        return unavailable("The pull request isn't on the space's code host");
      }

      const since = await this.builds.lastBuildFinishedAt(ticket.id);
      const { details, comments } = await repository.host.fetchPullRequestReview(pullRequestUrl, repository.token, since);
      return { pullRequestUrl, details, comments, unavailableReason: null, recorded: null };
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : "Could not read the pull request");
    }
  }
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
