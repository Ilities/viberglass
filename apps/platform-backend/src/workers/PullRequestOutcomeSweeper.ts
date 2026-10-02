import { createChildLogger } from '../config/logger';
import type { PullRequestOutcomeDAO } from '../persistence/job/PullRequestOutcomeDAO';
import type { ProjectScmTokenResolver } from '../services/pull-request-outcomes/ProjectScmTokenResolver';
import type { PullRequestOutcome, PullRequestOutcomeListener, PullRequestOutcomeSource } from '../services/pull-request-outcomes/pullRequestOutcomeTypes';

const logger = createChildLogger({ worker: 'PullRequestOutcomeSweeper' });

export interface PullRequestOutcomeSweeperConfig {
  sweepIntervalMs?: number;  // How often to sweep (default: 15 minutes)
  recheckAfterMs?: number;   // Minimum gap between checks of one open PR (default: 1 hour)
  batchSize?: number;        // PRs checked per sweep (default: 50)
}

/**
 * Labels agent-opened PRs with whether they were merged or closed, and tells
 * its listeners (a merge closes the task).
 *
 * Polls the SCM rather than waiting for webhooks, so PRs opened before this
 * existed, and PRs in repositories with no webhook configured, still get a
 * label. The first sweeps after deploy are the backfill.
 */
export class PullRequestOutcomeSweeper {
  private intervalId: NodeJS.Timeout | null = null;
  private config: Required<PullRequestOutcomeSweeperConfig>;

  constructor(
    private readonly outcomes: Pick<PullRequestOutcomeDAO, 'listDueForCheck' | 'recordOutcome' | 'recordError'>,
    private readonly tokens: Pick<ProjectScmTokenResolver, 'resolve'>,
    private readonly sources: PullRequestOutcomeSource[],
    config: PullRequestOutcomeSweeperConfig = {},
    private readonly listeners: PullRequestOutcomeListener[] = [],
  ) {
    this.config = {
      sweepIntervalMs: config.sweepIntervalMs ?? 900_000,
      recheckAfterMs: config.recheckAfterMs ?? 3_600_000,
      batchSize: config.batchSize ?? 50,
    };
  }

  start(): void {
    if (this.intervalId) {
      logger.warn('Already running');
      return;
    }

    logger.info('Starting pull request outcome sweep', this.config);

    this.sweep().catch((error) => {
      logger.error('Initial sweep failed', { error: error instanceof Error ? error.message : error });
    });

    this.intervalId = setInterval(() => {
      this.sweep().catch((error) => {
        logger.error('Sweep failed', { error: error instanceof Error ? error.message : error });
      });
    }, this.config.sweepIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Stopped');
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  /** Returns the number of PRs whose outcome was recorded. */
  async sweep(): Promise<number> {
    const recheckBefore = new Date(Date.now() - this.config.recheckAfterMs);
    const due = await this.outcomes.listDueForCheck(recheckBefore, this.config.batchSize);

    let recorded = 0;
    for (const { pullRequestUrl, projectId } of due) {
      const error = await this.check(pullRequestUrl, projectId);
      if (error) {
        await this.outcomes.recordError(pullRequestUrl, error);
      } else {
        recorded += 1;
      }
    }

    if (due.length > 0) {
      logger.info('Sweep complete', { checked: due.length, recorded });
    }
    return recorded;
  }

  /** A merged outcome is final and never checked again, so a listener's failure is logged rather than retried. */
  private async tell(pullRequestUrl: string, outcome: PullRequestOutcome): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener.onOutcome(pullRequestUrl, outcome);
      } catch (error) {
        logger.error('Outcome listener failed', { pullRequestUrl, error: error instanceof Error ? error.message : error });
      }
    }
  }

  /** Returns why no outcome was recorded, or null when one was. */
  private async check(pullRequestUrl: string, projectId: string | null): Promise<string | null> {
    const source = this.sources.find((candidate) => candidate.supports(pullRequestUrl));
    if (!source) return 'No outcome source supports this URL';
    if (!projectId) return 'No project recorded for this pull request';

    try {
      const token = await this.tokens.resolve(projectId);
      if (!token) return 'Project has no SCM token credential';

      const outcome = await source.fetchOutcome(pullRequestUrl, token);
      await this.outcomes.recordOutcome(pullRequestUrl, outcome);
      await this.tell(pullRequestUrl, outcome);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
}
