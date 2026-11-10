import { providerRetryFailure, type AcpProviderRetry, type AcpProviderRetryReader } from "./providerRetry";

const POLL_MS = 15_000;

/** Reads a harness's records of provider refusals while a turn runs, and gives up on one it would wait hours out. */
export class ProviderRetryWatch {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly reader: AcpProviderRetryReader,
    /** Called once, with the reason the turn fails. */
    private readonly onGiveUp: (reason: string) => void,
    private readonly pollMs = POLL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  start(sessionId: string): void {
    this.stop();
    const startedAt = this.now();
    this.timer = setInterval(() => {
      const retry = this.latest(sessionId);
      const failure = retry && providerRetryFailure(retry, startedAt, this.now());
      if (!failure) return;
      this.stop();
      this.onGiveUp(failure);
    }, this.pollMs);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** A record that can't be read is no reason to stop the turn. */
  private latest(sessionId: string): AcpProviderRetry | undefined {
    try {
      return this.reader.latest(sessionId);
    } catch {
      return undefined;
    }
  }
}
