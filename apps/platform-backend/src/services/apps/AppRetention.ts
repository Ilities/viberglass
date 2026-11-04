import { appBackupPath, releaseBundleKey } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppRetentionDAO } from "../../persistence/apps/AppRetentionDAO";
import type { SpaceFilesStore } from "../spaceFiles/SpaceFilesStore";
import { PURGE_GRACE_MS } from "../spaceFiles/SpaceFilesRetention";

const logger = createChildLogger({ service: "AppRetention" });

const DAY_MS = 24 * 60 * 60_000;

export interface AppRetentionLimits {
  /** Releases that went live whose bundles each app keeps, besides the current one. */
  liveReleases: number;
  /** How long a bundle that never went live, such as a preview's, is kept. */
  unusedBuildDays: number;
  backupDays: number;
}

function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function appRetentionLimits(env: Record<string, string | undefined> = process.env): AppRetentionLimits {
  return {
    liveReleases: positive(env.APPS_KEEP_LIVE_RELEASES, 5),
    unusedBuildDays: positive(env.APPS_UNUSED_BUILD_DAYS, 7),
    backupDays: positive(env.APPS_KEEP_BACKUP_DAYS, 30),
  };
}

/**
 * Removes release bundles and data backups apps no longer need. A bundle is
 * retired first, so nothing starts it again, and its bytes go after a grace
 * period; its release stays listed. A failed deletion is tried again on the
 * next sweep.
 */
export class AppRetention {
  constructor(
    private readonly retention: AppRetentionDAO,
    private readonly store: Pick<SpaceFilesStore, "bucket" | "delete">,
    private readonly limits: AppRetentionLimits = appRetentionLimits(),
    private readonly graceMs = PURGE_GRACE_MS,
  ) {}

  async sweep(now = new Date()): Promise<number> {
    const retired = await this.retention.listBundlesToRetire(this.limits.liveReleases, new Date(now.getTime() - this.limits.unusedBuildDays * DAY_MS));
    await this.retention.markBundlesRemoved(retired.map((release) => release.id));

    let removed = retired.length;
    for (const release of await this.retention.listBundlesToPurge(new Date(now.getTime() - this.graceMs))) {
      if (await this.remove(releaseBundleKey(release.projectId, release.id), `bundle of release ${release.id}`)) {
        await this.retention.markBundlePurged(release.id);
        removed++;
      }
    }
    for (const backup of await this.retention.listBackupsToDelete(new Date(now.getTime() - this.limits.backupDays * DAY_MS))) {
      if (await this.remove(`${appBackupPath(backup.projectId, backup.id)}/`, `data backup ${backup.id}`)) {
        await this.retention.deleteBackup(backup.id);
        removed++;
      }
    }
    return removed;
  }

  private async remove(key: string, what: string): Promise<boolean> {
    try {
      await this.store.delete(`s3://${this.store.bucket()}/${key}`);
      return true;
    } catch (error) {
      logger.warn(`Could not delete the ${what}; trying again next sweep`, { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
}
