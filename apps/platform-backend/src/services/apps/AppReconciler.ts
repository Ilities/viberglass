import type { AppHost, AppRelease } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppChange, AppDAO, AppRecord } from "../../persistence/apps/AppDAO";
import type { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { APP_STOP_GRACE_SECONDS } from "./appHostingConfig";
import type { AppInstanceRunner } from "./AppInstanceRunner";
import type { AppReleaseSwitch } from "./AppReleaseSwitch";

const logger = createChildLogger({ service: "AppReconciler" });

// Longer than any start, stop or switch takes, so one in progress isn't taken over.
const BUSY_STALE_MS = 15 * 60 * 1000;

export const NO_APP_HOST = "Apps can't run where this installation runs its agents yet.";

type Action = { kind: "stop" } | { kind: "start"; release: AppRelease } | { kind: "switch"; release: AppRelease } | { kind: "no_host" };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Brings an app to what its maintainers asked for: stopped when it's off, and
 * serving its newest release when it's on. One app does one thing at a time.
 */
export class AppReconciler {
  constructor(
    private readonly apps: Pick<AppDAO, "get" | "claim" | "update" | "finish">,
    private readonly releases: Pick<AppReleaseDAO, "getById" | "newestLiveCandidate" | "markLiveFailure">,
    private readonly host: () => AppHost | null,
    private readonly runner: Pick<AppInstanceRunner, "run">,
    private readonly switcher: Pick<AppReleaseSwitch, "switchTo">,
  ) {}

  /** Returns whether it acted. */
  async reconcile(projectId: string, now = new Date()): Promise<boolean> {
    const staleBefore = new Date(now.getTime() - BUSY_STALE_MS);
    const seen = await this.apps.get(projectId);
    if (!seen || (seen.busySince && seen.busySince > staleBefore) || !(await this.actionFor(seen))) return false;

    const app = await this.apps.claim(projectId, staleBefore);
    if (!app) return false;
    let outcome: AppChange = {};
    try {
      const action = await this.actionFor(app);
      if (!action) return false;
      outcome = await this.perform(app, action);
      return true;
    } catch (error) {
      logger.warn("Could not bring an app to its wanted state", { projectId, error: message(error) });
      outcome = { state: "failed", statusMessage: message(error) };
      return true;
    } finally {
      await this.apps.finish(projectId, outcome);
    }
  }

  private async actionFor(app: AppRecord): Promise<Action | null> {
    const host = this.host();
    if (app.power === "off") return app.state === "off" ? null : { kind: "stop" };

    const candidate = await this.releases.newestLiveCandidate(app.projectId);
    const current = app.currentReleaseId ? await this.releases.getById(app.currentReleaseId) : null;
    const newer = candidate && candidate.id !== current?.id && (!current || candidate.createdAt > current.createdAt);
    const wanted: Action | null = newer
      ? { kind: "switch", release: candidate }
      : current && app.state !== "running" && app.state !== "failed"
        ? { kind: "start", release: current }
        : null;
    if (wanted && !host) return app.state === "failed" ? null : { kind: "no_host" };
    return wanted;
  }

  private async perform(app: AppRecord, action: Action): Promise<AppChange> {
    const host = this.host();
    if (action.kind === "stop") {
      // Without a host nothing can be running.
      if (host) {
        await this.apps.update(app.projectId, { state: "stopping" });
        await host.stop(app.projectId, APP_STOP_GRACE_SECONDS);
      }
      return { state: "off", statusMessage: null };
    }
    if (action.kind === "no_host" || !host) return { state: "failed", statusMessage: NO_APP_HOST };
    if (action.kind === "start") {
      await this.apps.update(app.projectId, { state: "starting" });
      const failure = await this.runner.run(host, action.release);
      return failure ? { state: "failed", statusMessage: failure } : { state: "running", statusMessage: null };
    }
    try {
      return await this.switcher.switchTo(host, app, action.release);
    } catch (error) {
      // Not tried again; the next release is.
      await this.releases.markLiveFailure(action.release.id, message(error));
      throw error;
    }
  }
}
