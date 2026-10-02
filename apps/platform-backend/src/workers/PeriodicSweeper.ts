import { createChildLogger } from "../config/logger";

const logger = createChildLogger({ worker: "PeriodicSweeper" });

/**
 * Runs one piece of background work every so often, such as reminding people
 * of unanswered questions. A failed sweep is logged and the next one tries again.
 */
export class PeriodicSweeper {
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private readonly name: string,
    /** Returns how many things it acted on, for the log. */
    private readonly work: (now: Date) => Promise<number>,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    if (this.intervalId) return;
    logger.info("Starting sweep", { sweep: this.name, intervalMs: this.intervalMs });
    this.intervalId = setInterval(() => void this.sweep(), this.intervalMs);
  }

  stop(): void {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  async sweep(): Promise<void> {
    try {
      const done = await this.work(new Date());
      if (done > 0) logger.info("Sweep acted", { sweep: this.name, done });
    } catch (error) {
      logger.error("Sweep failed", { sweep: this.name, error: error instanceof Error ? error.message : String(error) });
    }
  }
}
