import { APP_HEALTH_PATH, type AppHost, type AppRelease } from "@viberglass/types";
import { appHealthTimeoutMs } from "./appHostingConfig";
import type { AppInstanceSpecs } from "./AppInstanceSpecs";

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
  async run(host: AppHost, release: AppRelease): Promise<string | null> {
    await host.create(await this.specs.specFor(host.target, release));
    await host.start(release.projectId);
    return this.waitHealthy(host, release.projectId);
  }

  private async waitHealthy(host: AppHost, projectId: string): Promise<string | null> {
    const url = `${host.address(projectId)}${APP_HEALTH_PATH}`;
    const deadline = Date.now() + this.timeoutMs();
    let lastStatus: number | null = null;
    while (Date.now() < deadline) {
      lastStatus = await this.probe.status(url);
      if (lastStatus === 200) return null;
      const instance = await host.status(projectId);
      if (instance.state === "stopped" || instance.state === "missing") {
        return this.withLogs(host, projectId, instance.detail ?? "The app stopped while starting");
      }
      await this.sleep(POLL_MS);
    }
    const answer = lastStatus === null ? "didn't answer" : `answered ${lastStatus}`;
    return this.withLogs(host, projectId, `The app ${answer} on ${APP_HEALTH_PATH} within ${Math.round(this.timeoutMs() / 1000)} seconds`);
  }

  private async withLogs(host: AppHost, projectId: string, reason: string): Promise<string> {
    const logs = (await host.logs(projectId, LOG_LINES_IN_REASON).catch(() => "")).trim();
    return logs ? `${reason}. Its last output:\n${logs}` : reason;
  }
}
