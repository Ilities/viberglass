import { randomUUID } from "crypto";
import { liveAppInstance, type AppHost, type AppRelease } from "@viberglass/types";
import type { AppChange, AppDAO, AppRecord } from "../../persistence/apps/AppDAO";
import type { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import type { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { APP_STOP_GRACE_SECONDS } from "./appHostingConfig";
import type { AppDataStore } from "./AppDataStore";
import type { AppInstanceRunner } from "./AppInstanceRunner";

/**
 * Makes a release an app's current one. An app has one SQLite writer, so the
 * running release stops before the new one starts. Its data is backed up in
 * between, and if the new release doesn't come up healthy that backup is
 * restored and the previous release starts again.
 */
export class AppReleaseSwitch {
  constructor(
    private readonly apps: Pick<AppDAO, "update">,
    private readonly releases: Pick<AppReleaseDAO, "getById" | "markLive" | "markLiveFailure">,
    private readonly backups: Pick<AppDataBackupDAO, "create">,
    private readonly data: Pick<AppDataStore, "backup" | "restore">,
    private readonly runner: Pick<AppInstanceRunner, "run">,
  ) {}

  /** The app must be claimed; returns how it ended for the caller to record. */
  async switchTo(host: AppHost, app: AppRecord, release: AppRelease): Promise<AppChange> {
    const projectId = app.projectId;
    await this.apps.update(projectId, { state: "stopping" });
    await host.stop(liveAppInstance(projectId), APP_STOP_GRACE_SECONDS);
    const backupId = await this.backup(projectId, release.id);

    await this.apps.update(projectId, { state: "starting" });
    const failure = await this.runner.run(host, release).catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
    if (!failure) {
      await this.releases.markLive(release.id);
      return { state: "running", statusMessage: null, currentReleaseId: release.id };
    }

    await host.stop(liveAppInstance(projectId), APP_STOP_GRACE_SECONDS);
    await this.releases.markLiveFailure(release.id, failure);
    // Whatever the failed release changed, such as its migrations, is undone.
    await this.data.restore(projectId, backupId);
    await host.clearData(liveAppInstance(projectId));
    const previous = app.currentReleaseId ? await this.releases.getById(app.currentReleaseId) : null;
    const notLive = `Release ${release.commitSha.slice(0, 7)} didn't go live: ${failure}`;
    if (!previous) return { state: "failed", statusMessage: notLive };

    const previousFailure = await this.runner.run(host, previous);
    return previousFailure
      ? { state: "failed", statusMessage: `${notLive}\n\nThe previous release didn't start again either: ${previousFailure}` }
      : { state: "running", statusMessage: `${notLive}\n\nThe previous release is serving again, with the data from before.` };
  }

  private async backup(projectId: string, releaseId: string): Promise<string> {
    const id = randomUUID();
    const copied = await this.data.backup(projectId, id);
    await this.backups.create({ id, projectId, reason: "release", releaseId, ...copied });
    return id;
  }
}
