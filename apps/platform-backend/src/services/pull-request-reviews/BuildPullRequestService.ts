import type { BuildPullRequest, Ticket } from "@viberglass/types";
import type { TaskBuildDAO } from "../../persistence/job/TaskBuildDAO";
import type { ProjectScmTokenResolver } from "../pull-request-outcomes/ProjectScmTokenResolver";
import type { GitHubPullRequestReviewSource } from "./GitHubPullRequestReviewSource";

/**
 * A task's pull request as GitHub has it, with its open review comments:
 * what the build step shows, and what "ask for changes" sends to the agent
 * with the reviewer's note. Never throws; a pull request that can't be read
 * says why instead.
 */
export class BuildPullRequestService {
  constructor(
    private readonly reviews: Pick<GitHubPullRequestReviewSource, "supports" | "fetchReview">,
    private readonly tokens: Pick<ProjectScmTokenResolver, "resolve">,
    private readonly builds: Pick<TaskBuildDAO, "lastBuildFinishedAt">,
  ) {}

  async forTask(ticket: Pick<Ticket, "id" | "projectId" | "pullRequestUrl">): Promise<BuildPullRequest> {
    const pullRequestUrl = ticket.pullRequestUrl ?? null;
    const unavailable = (reason: string): BuildPullRequest => ({ pullRequestUrl, details: null, comments: [], unavailableReason: reason });

    if (!pullRequestUrl) return unavailable("This task has no pull request yet");
    if (!this.reviews.supports(pullRequestUrl)) return unavailable("Review comments are read from GitHub pull requests only");

    try {
      const token = await this.tokens.resolve(ticket.projectId);
      if (!token) return unavailable("The space's repository connection has no token to read the pull request with");

      const since = await this.builds.lastBuildFinishedAt(ticket.id);
      const { details, comments } = await this.reviews.fetchReview(pullRequestUrl, token, since);
      return { pullRequestUrl, details, comments, unavailableReason: null };
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : "Could not read the pull request");
    }
  }
}
