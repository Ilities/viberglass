import { JobService } from '../services/JobService';

export interface OrphanSweeperConfig {
  sweepIntervalMs?: number;  // How often to check (default: 60 seconds)
  jobTimeoutMs?: number;     // Job considered orphaned after (default: 30 minutes)
}

export class OrphanSweeper {
  private intervalId: NodeJS.Timeout | null = null;
  private jobService = new JobService();
  private config: Required<OrphanSweeperConfig>;

  constructor(config: OrphanSweeperConfig = {}) {
    this.config = {
      sweepIntervalMs: config.sweepIntervalMs ?? 60_000,      // 1 minute
      jobTimeoutMs: config.jobTimeoutMs ?? 30 * 60_000,       // 30 minutes
    };
  }

  /**
   * Start the background sweep
   */
  start(): void {
    if (this.intervalId) {
      console.warn('[OrphanSweeper] Already running');
      return;
    }

    console.info('[OrphanSweeper] Starting orphan detection sweep', {
      sweepIntervalMs: this.config.sweepIntervalMs,
      jobTimeoutMs: this.config.jobTimeoutMs,
    });

    // Run immediately on start, then at interval
    this.sweep().catch(error => {
      console.error('[OrphanSweeper] Initial sweep failed', { error });
    });

    this.intervalId = setInterval(() => {
      this.sweep().catch(error => {
        console.error('[OrphanSweeper] Sweep failed', { error });
      });
    }, this.config.sweepIntervalMs);
  }

  /**
   * Stop the background sweep (important for clean shutdown)
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.info('[OrphanSweeper] Stopped');
    }
  }

  /**
   * Run a single sweep iteration
   */
  async sweep(): Promise<number> {
    const cutoffTime = new Date(Date.now() - this.config.jobTimeoutMs);

    console.debug('[OrphanSweeper] Running sweep', { cutoffTime });

    const orphanedJobs = await this.jobService.findOrphanedJobs(cutoffTime);

    for (const job of orphanedJobs) {
      console.warn('[OrphanSweeper] Marking job as timed out', {
        jobId: job.id,
        startedAt: job.started_at,
      });

      await this.jobService.updateJobStatus(job.id, 'failed', {
        errorMessage: `Job timed out after ${this.config.jobTimeoutMs / 1000}s without callback`,
      });
    }

    if (orphanedJobs.length > 0) {
      console.info('[OrphanSweeper] Sweep completed', {
        orphanCount: orphanedJobs.length,
      });
    }

    return orphanedJobs.length;
  }

  /**
   * Check if sweeper is running
   */
  isRunning(): boolean {
    return this.intervalId !== null;
  }
}
