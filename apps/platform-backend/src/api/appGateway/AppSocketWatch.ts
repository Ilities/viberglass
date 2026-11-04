import type { Duplex } from "stream";

interface Watched {
  socket: Duplex;
  slug: string;
  token: string;
}

/**
 * Websockets are checked once, at the upgrade, and can stay open for hours.
 * This checks them again now and then, and closes those whose person has
 * lost access, signed out or whose app was turned off.
 */
export class AppSocketWatch {
  private readonly open = new Set<Watched>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly stillAllowed: (slug: string, token: string) => Promise<boolean>,
    private readonly intervalMs: number,
  ) {}

  add(socket: Duplex, slug: string, token: string): void {
    const watched = { socket, slug, token };
    this.open.add(watched);
    socket.once("close", () => this.open.delete(watched));
    if (!this.timer) {
      this.timer = setInterval(() => void this.check(), this.intervalMs);
      this.timer.unref();
    }
  }

  async check(): Promise<void> {
    for (const watched of [...this.open]) {
      // A check that fails is tried again next time.
      const allowed = await this.stillAllowed(watched.slug, watched.token).catch(() => true);
      if (!allowed) {
        this.open.delete(watched);
        watched.socket.destroy();
      }
    }
    if (this.open.size === 0) this.stop();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
