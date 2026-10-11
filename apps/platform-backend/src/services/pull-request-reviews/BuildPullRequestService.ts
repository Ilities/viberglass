import type { BuildPullRequest, TaskPullRequest, Ticket } from "@viberglass/types";
import type { TaskBuildDAO } from "../../persistence/job/TaskBuildDAO";
import type { TaskPullRequestDAO } from "../../persistence/ticketing/TaskPullRequestDAO";
import type { ProjectRepositoryResolver } from "../repositories/ProjectRepositoryResolver";

/**
 * A task's pull requests as the space's code host has them, with their open review comments:
 * what the Code tab shows, and what "ask for changes" sends to the agent with
 * the reviewer's note. Never throws; a pull request that can't be read says
 * why instead.
 */
export class BuildPullRequestService {
  constructor(
    private readonly repositories: Pick<ProjectRepositoryResolver, "resolve">,
    private readonly builds: Pick<TaskBuildDAO, "lastBuildFinishedAt">,
    private readonly pullRequests: Pick<TaskPullRequestDAO, "listForTask">,
  ) {}

  /** The task's latest pull request, which its next build continues. */
  async forTask(ticket: Pick<Ticket, "id" | "projectId" | "pullRequestUrl">): Promise<BuildPullRequest> {
    return this.read(ticket, ticket.pullRequestUrl ?? null);
  }

  /** Every pull request the task's builds opened, oldest first. */
  async listForTask(ticket: Pick<Ticket, "id" | "projectId">): Promise<TaskPullRequest[]> {
    const pullRequests = await this.pullRequests.listForTask(ticket.id);
    return Promise.all(
      pullRequests.map(async (pullRequest) => ({
        ...(await this.read(ticket, pullRequest.url)),
        pullRequestUrl: pullRequest.url,
        branch: pullRequest.branch,
        firstPart: pullRequest.firstPart,
        lastPart: pullRequest.lastPart,
      })),
    );
  }

  private async read(ticket: Pick<Ticket, "id" | "projectId">, pullRequestUrl: string | null): Promise<BuildPullRequest> {
    const unavailable = (reason: string): BuildPullRequest => ({ pullRequestUrl, details: null, comments: [], unavailableReason: reason });

    if (!pullRequestUrl) return unavailable("This task has no pull request yet");

    try {
      const repository = await this.repositories.resolve(ticket.projectId);
      if ("unavailable" in repository) return unavailable(repository.unavailable);
      if (!repository.host.ownsPullRequest(pullRequestUrl)) {
        return unavailable("The pull request isn't on the space's code host");
      }

      const since = await this.builds.lastBuildFinishedAt(ticket.id);
      const { details, comments } = await repository.host.fetchPullRequestReview(pullRequestUrl, repository.token, since);
      return { pullRequestUrl, details, comments, unavailableReason: null };
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : "Could not read the pull request");
    }
  }
}
