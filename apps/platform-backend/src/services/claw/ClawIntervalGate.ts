/**
 * Decides when an interval schedule is due. The engine checks it on a
 * once-a-minute tick, so runs land on the first tick after the interval has
 * passed since the previous run.
 */
export class ClawIntervalGate {
  private lastRunAt: number;

  constructor(
    private readonly intervalMs: number,
    lastRunAt: Date,
  ) {
    this.lastRunAt = lastRunAt.getTime();
  }

  /** Returns true when a run is due, and counts it as the new previous run. */
  takeDueRun(now: Date): boolean {
    if (now.getTime() - this.lastRunAt < this.intervalMs) return false;
    this.lastRunAt = now.getTime();
    return true;
  }
}
