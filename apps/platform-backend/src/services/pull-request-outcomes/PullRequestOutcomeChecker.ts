import { createChildLogger } from "../../config/logger";
import type { PullRequestOutcomeDAO } from "../../persistence/job/PullRequestOutcomeDAO";
import type { PullRequestOutcome } from "@viberglass/types";
import type { ProjectRepositoryResolver } from "../repositories/ProjectRepositoryResolver";
import type { PullRequestOutcomeListener } from "./pullRequestOutcomeTypes";

const logger = createChildLogger({ service: "PullRequestOutcomeChecker" });

/** Reads one pull request's outcome from the space's code host, records it, and tells the listeners (a merge closes the task). */
export class PullRequestOutcomeChecker {
  constructor(
    private readonly outcomes: Pick<PullRequestOutcomeDAO, "recordOutcome">,
    private readonly repositories: Pick<ProjectRepositoryResolver, "resolve">,
    private readonly listeners: PullRequestOutcomeListener[] = [],
  ) {}

  /** Returns why no outcome was recorded, or null when one was. */
  async check(pullRequestUrl: string, projectId: string | null): Promise<string | null> {
    if (!projectId) return "No project recorded for this pull request";

    try {
      const repository = await this.repositories.resolve(projectId);
      if ("unavailable" in repository) return repository.unavailable;
      if (!repository.host.ownsPullRequest(pullRequestUrl)) return "The space's code host doesn't host this pull request";

      const outcome = await repository.host.fetchPullRequestOutcome(pullRequestUrl, repository.token);
      await this.outcomes.recordOutcome(pullRequestUrl, outcome);
      await this.tell(pullRequestUrl, outcome);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  /** A merged outcome is final and never checked again, so a listener's failure is logged rather than retried. */
  private async tell(pullRequestUrl: string, outcome: PullRequestOutcome): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener.onOutcome(pullRequestUrl, outcome);
      } catch (error) {
        logger.error("Outcome listener failed", { pullRequestUrl, error: error instanceof Error ? error.message : error });
      }
    }
  }
}
