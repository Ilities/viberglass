import { JobService } from '../services/JobService';

export interface HeartbeatSweeperConfig {
  sweepIntervalMs?: number;  // How often to check (default: 60 seconds)
  gracePeriodMs?: number;    // Job considered stale after (default: 5 minutes)
}

export class HeartbeatSweeper {
  private intervalId: NodeJS.Timeout | null = null;
  private jobService = new JobService();
  private config: Required<HeartbeatSweeperConfig>;

  constructor(config: HeartbeatSweeperConfig = {}) {
    this.config = {
      sweepIntervalMs: config.sweepIntervalMs ?? 60_000,      // 1 minute
      gracePeriodMs: config.gracePeriodMs ?? 300_000,         // 5 minutes
    };
  }

  /**
   * Start the background sweep
   */
  start(): void {
    if (this.intervalId) {
      console.warn('[HeartbeatSweeper] Already running');
      return;
    }

    console.info('[HeartbeatSweeper] Starting stale job detection sweep', {
      sweepIntervalMs: this.config.sweepIntervalMs,
      gracePeriodMs: this.config.gracePeriodMs,
    });

    // Run immediately on start, then at interval
    this.sweep().catch(error => {
      console.error('[HeartbeatSweeper] Initial sweep failed', { error });
    });

    this.intervalId = setInterval(() => {
      this.sweep().catch(error => {
        console.error('[HeartbeatSweeper] Sweep failed', { error });
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
      console.info('[HeartbeatSweeper] Stopped');
    }
  }

  /**
   * Run a single sweep iteration
   */
  async sweep(): Promise<number> {
    const staleThreshold = new Date(Date.now() - this.config.gracePeriodMs);

    console.debug('[HeartbeatSweeper] Running sweep', { staleThreshold });

    const staleJobs = await this.jobService.findStaleJobs(staleThreshold);

    for (const job of staleJobs) {
      console.warn('[HeartbeatSweeper] Marking job as failed (no heartbeat)', {
        jobId: job.id,
        startedAt: job.started_at,
        lastHeartbeat: job.last_heartbeat,
      });

      await this.jobService.updateJobStatus(job.id, 'failed', {
        errorMessage: 'Job failed: No heartbeat received within grace period',
      });
    }

    if (staleJobs.length > 0) {
      console.info('[HeartbeatSweeper] Sweep completed', {
        staleCount: staleJobs.length,
      });
    }

    return staleJobs.length;
  }

  /**
   * Check if sweeper is running
   */
  isRunning(): boolean {
    return this.intervalId !== null;
  }
}
