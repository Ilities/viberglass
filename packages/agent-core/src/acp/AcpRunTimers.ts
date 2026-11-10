const minutes = (ms: number) => `${Math.round(ms / 60_000)} minutes`;

/**
 * The limits on a harness's turn: the time it has, and how long it may stay
 * quiet before it's taken as stalled, with a warning halfway there.
 */
export class AcpRunTimers {
  private timeout?: NodeJS.Timeout;
  private stall?: NodeJS.Timeout;
  private stallWarning?: NodeJS.Timeout;

  constructor(
    private readonly timeoutMs: number,
    private readonly stallAfterMs: number,
    /** Called once a limit is reached, with the reason the turn fails. */
    private readonly onLimit: (reason: string) => void,
    /** Called when the harness has been quiet for half the time it may be. */
    private readonly onQuiet: (text: string) => void,
  ) {}

  start(): void {
    this.timeout = setTimeout(() => this.reach(`Agent timed out after ${minutes(this.timeoutMs)}`), this.timeoutMs);
    this.stall = setTimeout(() => this.reach(`Agent stalled: its harness sent nothing for ${minutes(this.stallAfterMs)}`), this.stallAfterMs);
    this.stallWarning = setTimeout(
      () =>
        this.onQuiet(
          `The agent hasn't sent anything for ${minutes(this.stallAfterMs / 2)}. If it stays quiet, the run stops as stalled after ${minutes(this.stallAfterMs)}, keeping its changes.`,
        ),
      this.stallAfterMs / 2,
    );
  }

  /** The harness sent something, so its quiet starts over. */
  heard(): void {
    this.stall?.refresh();
    this.stallWarning?.refresh();
  }

  /** Dropped rather than only cleared: refreshing a fired or cleared timer starts it again. */
  stop(): void {
    clearTimeout(this.timeout);
    clearTimeout(this.stall);
    clearTimeout(this.stallWarning);
    this.timeout = undefined;
    this.stall = undefined;
    this.stallWarning = undefined;
  }

  private reach(reason: string): void {
    this.stop();
    this.onLimit(reason);
  }
}
