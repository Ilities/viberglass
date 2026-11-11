import { createChildLogger } from '../config/logger';
import type { PullRequestOutcomeDAO } from '../persistence/job/PullRequestOutcomeDAO';
import type { PullRequestOutcomeChecker } from '../services/pull-request-outcomes/PullRequestOutcomeChecker';

const logger = createChildLogger({ worker: 'PullRequestOutcomeSweeper' });

export interface PullRequestOutcomeSweeperConfig {
  sweepIntervalMs?: number;       // How often to sweep (default: 5 minutes)
  recheckAfterMs?: number;        // Minimum gap between checks of a recent open PR (default: 4 minutes)
  olderAfterMs?: number;          // How long after it was first seen an open PR counts as older (default: 1 day)
  olderRecheckAfterMs?: number;   // Minimum gap between checks of an older open PR (default: 1 hour)
  batchSize?: number;             // PRs checked per sweep (default: 50)
}

/**
 * Labels agent-opened PRs with whether they were merged or closed, and tells
 * its listeners (a merge closes the task).
 *
 * Polls the SCM rather than waiting for webhooks, so PRs opened before this
 * existed, and PRs in repositories with no webhook configured, still get a
 * label. The first sweeps after deploy are the backfill.
 *
 * Each check is one GET per PR. A PR open for more than a day is usually
 * waiting on people rather than about to merge, so it's checked hourly; a
 * batch of 50 every 5 minutes stays far below GitHub's hourly request limit.
 */
export class PullRequestOutcomeSweeper {
  private intervalId: NodeJS.Timeout | null = null;
  private config: Required<PullRequestOutcomeSweeperConfig>;

  constructor(
    private readonly outcomes: Pick<PullRequestOutcomeDAO, 'listDueForCheck' | 'recordError'>,
    private readonly checker: Pick<PullRequestOutcomeChecker, 'check'>,
    config: PullRequestOutcomeSweeperConfig = {},
  ) {
    this.config = {
      sweepIntervalMs: config.sweepIntervalMs ?? 300_000,
      // Under the sweep interval, so a PR checked on one sweep is due on the next.
      recheckAfterMs: config.recheckAfterMs ?? 240_000,
      olderAfterMs: config.olderAfterMs ?? 86_400_000,
      olderRecheckAfterMs: config.olderRecheckAfterMs ?? 3_600_000,
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
    const now = Date.now();
    const due = await this.outcomes.listDueForCheck(
      {
        recentSince: new Date(now - this.config.olderAfterMs),
        recentBefore: new Date(now - this.config.recheckAfterMs),
        olderBefore: new Date(now - this.config.olderRecheckAfterMs),
      },
      this.config.batchSize,
    );

    let recorded = 0;
    for (const { pullRequestUrl, projectId } of due) {
      const error = await this.checker.check(pullRequestUrl, projectId);
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
}
