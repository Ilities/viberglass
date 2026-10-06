import { createChildLogger } from "../../config/logger";
import type { PullRequestOutcomeDAO } from "../../persistence/job/PullRequestOutcomeDAO";
import type { ProjectScmTokenResolver } from "./ProjectScmTokenResolver";
import type { PullRequestOutcome, PullRequestOutcomeListener, PullRequestOutcomeSource } from "./pullRequestOutcomeTypes";

const logger = createChildLogger({ service: "PullRequestOutcomeChecker" });

/** Reads one pull request's outcome from its SCM, records it, and tells the listeners (a merge closes the task). */
export class PullRequestOutcomeChecker {
  constructor(
    private readonly outcomes: Pick<PullRequestOutcomeDAO, "recordOutcome">,
    private readonly tokens: Pick<ProjectScmTokenResolver, "resolve">,
    private readonly sources: PullRequestOutcomeSource[],
    private readonly listeners: PullRequestOutcomeListener[] = [],
  ) {}

  /** Returns why no outcome was recorded, or null when one was. */
  async check(pullRequestUrl: string, projectId: string | null): Promise<string | null> {
    const source = this.sources.find((candidate) => candidate.supports(pullRequestUrl));
    if (!source) return "No outcome source supports this URL";
    if (!projectId) return "No project recorded for this pull request";

    try {
      const token = await this.tokens.resolve(projectId);
      if (!token) return "Project has no SCM token credential";

      const outcome = await source.fetchOutcome(pullRequestUrl, token);
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
