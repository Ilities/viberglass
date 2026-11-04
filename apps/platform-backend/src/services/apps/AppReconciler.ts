import { liveAppInstance, type AppHost, type AppRelease } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppChange, AppDAO, AppRecord, RollbackOrder } from "../../persistence/apps/AppDAO";
import type { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { APP_STOP_GRACE_SECONDS } from "./appHostingConfig";
import type { AppInstanceRunner } from "./AppInstanceRunner";
import type { AppReleaseSwitch } from "./AppReleaseSwitch";
import type { AppRollbackSettler } from "./AppRollbackSettler";

const logger = createChildLogger({ service: "AppReconciler" });

// Longer than any start, stop or switch takes, so one in progress isn't taken over.
const BUSY_STALE_MS = 15 * 60 * 1000;

export const NO_APP_HOST = "Apps can't run where this installation runs its agents yet.";

type Action =
  | { kind: "stop" }
  | { kind: "start"; release: AppRelease }
  | { kind: "switch"; release: AppRelease }
  | { kind: "rollback"; release: AppRelease; order: RollbackOrder }
  | { kind: "settle"; release: AppRelease; order: RollbackOrder }
  | { kind: "drop"; order: RollbackOrder }
  | { kind: "no_host" };

const RUNS = new Set<Action["kind"]>(["start", "switch", "rollback"]);

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Brings an app to what its maintainers asked for: stopped when it's off, and
 * serving the release they rolled back to, or else its newest, when it's on.
 * One app does one thing at a time.
 */
export class AppReconciler {
  constructor(
    private readonly apps: Pick<AppDAO, "get" | "claim" | "update" | "finish" | "clearRollback">,
    private readonly releases: Pick<AppReleaseDAO, "getById" | "newestLiveCandidate" | "markLiveFailure">,
    private readonly host: () => AppHost | null,
    private readonly runner: Pick<AppInstanceRunner, "run">,
    private readonly switcher: Pick<AppReleaseSwitch, "switchTo">,
    private readonly rollbacks: Pick<AppRollbackSettler, "settle">,
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
    const current = app.currentReleaseId ? await this.releases.getById(app.currentReleaseId) : null;
    const order = app.rollback;
    // A rollback that went live but whose releases weren't set aside yet.
    if (order && current && order.releaseId === current.id) return { kind: "settle", release: current, order };
    if (app.power === "off") return app.state === "off" ? null : { kind: "stop" };

    const wanted = order ? await this.rollbackAction(order) : await this.releaseAction(app, current);
    if (wanted && RUNS.has(wanted.kind) && !host) return app.state === "failed" ? null : { kind: "no_host" };
    return wanted;
  }

  private async rollbackAction(order: RollbackOrder): Promise<Action> {
    const release = await this.releases.getById(order.releaseId);
    return release && release.status === "ready" && !release.bundleRemoved ? { kind: "rollback", release, order } : { kind: "drop", order };
  }

  private async releaseAction(app: AppRecord, current: AppRelease | null): Promise<Action | null> {
    const candidate = await this.releases.newestLiveCandidate(app.projectId);
    const newer = candidate && candidate.id !== current?.id && (!current || candidate.createdAt > current.createdAt);
    if (newer) return { kind: "switch", release: candidate };
    return current && app.state !== "running" && app.state !== "failed" ? { kind: "start", release: current } : null;
  }

  private async perform(app: AppRecord, action: Action): Promise<AppChange> {
    const host = this.host();
    if (action.kind === "stop") {
      // Without a host nothing can be running.
      if (host) {
        await this.apps.update(app.projectId, { state: "stopping" });
        await host.stop(liveAppInstance(app.projectId), APP_STOP_GRACE_SECONDS);
      }
      return { state: "off", statusMessage: null };
    }
    if (action.kind === "drop") {
      await this.apps.clearRollback(app.projectId, action.order.releaseId);
      return {};
    }
    if (action.kind === "settle") return this.settle(action.release, action.order);
    if (action.kind === "no_host" || !host) return { state: "failed", statusMessage: NO_APP_HOST };
    if (action.kind === "rollback") return this.rollBack(host, app, action.release, action.order);
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

  private async rollBack(host: AppHost, app: AppRecord, release: AppRelease, order: RollbackOrder): Promise<AppChange> {
    const outcome = await this.switcher.switchTo(host, app, release, { backupId: order.backupId }).catch(async (error: unknown) => {
      await this.apps.clearRollback(app.projectId, release.id);
      throw error;
    });
    if (outcome.currentReleaseId !== release.id) {
      await this.apps.clearRollback(app.projectId, release.id);
      return outcome;
    }
    await this.settle(release, order);
    return outcome;
  }

  /** The rollback is live either way; setting releases aside is tried again on the next sweep if it fails. */
  private async settle(release: AppRelease, order: RollbackOrder): Promise<AppChange> {
    try {
      await this.rollbacks.settle(release, order);
    } catch (error) {
      logger.warn("Rolled an app back, but couldn't set its newer releases aside yet", { releaseId: release.id, error: message(error) });
    }
    return {};
  }
}
