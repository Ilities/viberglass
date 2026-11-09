import { randomUUID } from "crypto";
import { liveAppInstance, type AppHost } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppChange, AppDAO, AppRecord, DataRestoreOrder } from "../../persistence/apps/AppDAO";
import type { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import type { AppDataOrderDAO } from "../../persistence/apps/AppDataOrderDAO";
import type { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { APP_STOP_GRACE_SECONDS } from "./appHostingConfig";
import type { AppDataStore } from "./AppDataStore";
import type { AppInstanceRunner } from "./AppInstanceRunner";

const logger = createChildLogger({ service: "AppDataMaintenance" });

/** Hears how a scheduled restore went: null when the data is back, else why not. */
export interface DataRestoreReporter {
  finish(executionId: string, failure: string | null): Promise<void>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Takes a backup a maintainer asked for, and puts the data back to a backup on
 * a schedule. Both copy the replica, which is only consistent while the app is
 * stopped, so a running app stops first and starts again on the same release.
 * A restore takes no backup of the data it replaces: a schedule that resets an
 * app every hour would pile up copies nobody wants, and the backup it restores
 * from stays, so a failed restore can be run again.
 */
export class AppDataMaintenance {
  constructor(
    private readonly apps: Pick<AppDAO, "update">,
    private readonly orders: Pick<AppDataOrderDAO, "clearBackup" | "clearRestore">,
    private readonly releases: Pick<AppReleaseDAO, "getById">,
    private readonly backups: Pick<AppDataBackupDAO, "create">,
    private readonly data: Pick<AppDataStore, "backup" | "restore">,
    private readonly runner: Pick<AppInstanceRunner, "run">,
    private readonly reporter: DataRestoreReporter,
  ) {}

  /** The app must be claimed. A backup that fails leaves the data as it was, so the app starts again either way. */
  async backUp(host: AppHost | null, app: AppRecord): Promise<AppChange> {
    await this.orders.clearBackup(app.projectId);
    const wasRunning = await this.stop(host, app);
    let failure: string | null = null;
    try {
      const id = randomUUID();
      const copied = await this.data.backup(app.projectId, id);
      await this.backups.create({ id, projectId: app.projectId, reason: "manual", releaseId: null, fromReleaseId: app.currentReleaseId, ...copied });
    } catch (error) {
      failure = `Couldn't back up the app's data: ${message(error)}`;
    }
    const change = host && wasRunning ? await this.startAgain(host, app) : {};
    return failure && change.state !== "failed" ? { ...change, statusMessage: failure } : change;
  }

  /** The app must be claimed. Off, it stays off with the restored data; running, it starts again with it. */
  async restore(host: AppHost | null, app: AppRecord, order: DataRestoreOrder): Promise<AppChange> {
    let change: AppChange;
    try {
      const wasRunning = await this.stop(host, app);
      await this.data.restore(app.projectId, order.backupId);
      // The local copy would win over the replica on the next start.
      await host?.clearData(liveAppInstance(app.projectId));
      change = host && wasRunning ? await this.startAgain(host, app) : {};
    } catch (error) {
      await this.finish(app.projectId, order, `Couldn't restore the app's data: ${message(error)}`);
      throw new Error(`Couldn't restore the app's data: ${message(error)}`);
    }
    await this.finish(app.projectId, order, change.state === "failed" ? (change.statusMessage ?? "The app didn't start again.") : null);
    return change;
  }

  /** Returns whether it was running. Without a host nothing can be. */
  private async stop(host: AppHost | null, app: AppRecord): Promise<boolean> {
    if (!host) return false;
    const wasRunning = app.state === "running";
    if (wasRunning) await this.apps.update(app.projectId, { state: "stopping" });
    await host.stop(liveAppInstance(app.projectId), APP_STOP_GRACE_SECONDS);
    return wasRunning;
  }

  private async startAgain(host: AppHost, app: AppRecord): Promise<AppChange> {
    const release = app.currentReleaseId ? await this.releases.getById(app.currentReleaseId) : null;
    if (!release) return { state: "failed", statusMessage: "The app's release is gone, so it couldn't start again." };
    await this.apps.update(app.projectId, { state: "starting" });
    const failure = await this.runner.run(host, release).catch(message);
    return failure ? { state: "failed", statusMessage: failure } : { state: "running", statusMessage: null };
  }

  /** The order is cleared before reporting, so a report that fails doesn't run the restore again. */
  private async finish(projectId: string, order: DataRestoreOrder, failure: string | null): Promise<void> {
    await this.orders.clearRestore(projectId, order.backupId);
    if (!order.executionId) return;
    await this.reporter.finish(order.executionId, failure).catch((error: unknown) => {
      logger.warn("Couldn't record how a scheduled restore went", { projectId, executionId: order.executionId, error: message(error) });
    });
  }
}
