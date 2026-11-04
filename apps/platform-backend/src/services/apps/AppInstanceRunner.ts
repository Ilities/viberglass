import { APP_HEALTH_PATH, type AppHost, type AppRelease } from "@viberglass/types";
import { appHealthTimeoutMs } from "./appHostingConfig";
import type { AppInstanceRole, AppInstanceSpecs } from "./AppInstanceSpecs";

const POLL_MS = 2000;
const PROBE_TIMEOUT_MS = 5000;
const LOG_LINES_IN_REASON = 20;

export interface HealthProbe {
  /** The HTTP status `url` answered with, or null when it couldn't be reached. */
  status(url: string): Promise<number | null>;
}

export const fetchHealthProbe: HealthProbe = {
  async status(url) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), redirect: "manual" });
      return response.status;
    } catch {
      return null;
    }
  },
};

/** Starts a release on a host and waits until it answers its health check. */
export class AppInstanceRunner {
  constructor(
    private readonly specs: Pick<AppInstanceSpecs, "specFor">,
    private readonly probe: HealthProbe = fetchHealthProbe,
    private readonly timeoutMs: () => number = () => appHealthTimeoutMs(process.env),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  /** Null once the release is healthy, otherwise why it isn't. */
  async run(host: AppHost, release: AppRelease, role?: AppInstanceRole): Promise<string | null> {
    const spec = await this.specs.specFor(host.target, release, role);
    await host.create(spec);
    await host.start(spec.instance);
    return this.waitHealthy(host, spec.instance);
  }

  private async waitHealthy(host: AppHost, instance: string): Promise<string | null> {
    const url = `${host.address(instance)}${APP_HEALTH_PATH}`;
    const deadline = Date.now() + this.timeoutMs();
    let lastStatus: number | null = null;
    while (Date.now() < deadline) {
      lastStatus = await this.probe.status(url);
      if (lastStatus === 200) return null;
      const status = await host.status(instance);
      if (status.state === "stopped" || status.state === "missing") {
        return this.withLogs(host, instance, status.detail ?? "The app stopped while starting");
      }
      await this.sleep(POLL_MS);
    }
    const answer = lastStatus === null ? "didn't answer" : `answered ${lastStatus}`;
    return this.withLogs(host, instance, `The app ${answer} on ${APP_HEALTH_PATH} within ${Math.round(this.timeoutMs() / 1000)} seconds`);
  }

  private async withLogs(host: AppHost, instance: string, reason: string): Promise<string> {
    const logs = (await host.logs(instance, LOG_LINES_IN_REASON).catch(() => "")).trim();
    return logs ? `${reason}. Its last output:\n${logs}` : reason;
  }
}
