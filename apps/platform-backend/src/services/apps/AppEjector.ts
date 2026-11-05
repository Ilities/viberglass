import { randomUUID } from "node:crypto";
import { ejectedAppDataKey, liveAppInstance, previewInstance, type AppHost } from "@viberglass/types";
import type { AppDAO } from "../../persistence/apps/AppDAO";
import type { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import type { AppDataGrantDAO } from "../../persistence/apps/AppDataGrantDAO";
import type { AppSettingDAO } from "../../persistence/apps/AppSettingDAO";
import type { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import type { EjectedApp, SpaceBackingDAO } from "../../persistence/apps/SpaceBackingDAO";
import type { AppClaims } from "./AppClaims";
import type { AppDataCopier } from "./AppDataCopier";
import type { AppDataStore } from "./AppDataStore";
import { APP_STOP_GRACE_SECONDS } from "./appHostingConfig";
import { AppSpaceError } from "./AppSpaceError";

interface Dependencies {
  spaces: Pick<AppSpaceDAO, "findById">;
  claims: Pick<AppClaims, "claimAll">;
  apps: Pick<AppDAO, "get" | "update">;
  host: () => AppHost | null;
  data: Pick<AppDataStore, "backup">;
  backups: Pick<AppDataBackupDAO, "create">;
  copier: Pick<AppDataCopier, "copy" | "remove">;
  settings: Pick<AppSettingDAO, "list">;
  secrets: { deleteSecret(id: string): Promise<boolean> };
  grants: Pick<AppDataGrantDAO, "listUntakenForProject">;
  backing: Pick<SpaceBackingDAO, "makeGit">;
  /** Schedules that turned the app on or off are gone, so the scheduler reloads. */
  refreshSchedules: () => Promise<void>;
}

/**
 * Turns an App space back into a git space. The app stops for good with a
 * last backup and a SQLite copy to download; its instances, previews, secret
 * settings and waiting data copies go. The repository is left as it is.
 */
export class AppEjector {
  constructor(private readonly deps: Dependencies) {}

  /** Throws APP_BUSY while the app or a preview is starting or stopping, before anything changes. */
  async eject(projectId: string, now = new Date()): Promise<Omit<EjectedApp, "backupId">> {
    if (!(await this.deps.spaces.findById(projectId))) throw new AppSpaceError("NOT_AN_APP_SPACE", "This space has no app.");
    const { previewIds, release } = await this.deps.claims.claimAll(projectId, now);
    let kept: Omit<EjectedApp, "ejectedAt">;
    try {
      kept = await this.stop(projectId);
      const host = this.deps.host();
      if (host) {
        for (const id of previewIds) await host.delete(previewInstance(id));
        await host.delete(liveAppInstance(projectId));
        await host.forgetSpace(projectId);
      }
      for (const setting of await this.deps.settings.list(projectId)) {
        if (setting.secretId) await this.deps.secrets.deleteSecret(setting.secretId);
      }
      for (const grant of await this.deps.grants.listUntakenForProject(projectId)) await this.deps.copier.remove(grant.objectKey);
      await this.deps.backing.makeGit(projectId, kept, now);
    } catch (error) {
      await release();
      throw error;
    }
    await this.deps.refreshSchedules();
    return { ejectedAt: now, copyBytes: kept.copyBytes };
  }

  /** An app that never served a release has no data to keep. */
  private async stop(projectId: string): Promise<Omit<EjectedApp, "ejectedAt">> {
    const app = await this.deps.apps.get(projectId);
    if (!app) return { backupId: null, copyBytes: null };
    await this.deps.apps.update(projectId, { power: "off", state: "stopping" });
    await this.deps.host()?.stop(liveAppInstance(projectId), APP_STOP_GRACE_SECONDS);
    if (!app.currentReleaseId) return { backupId: null, copyBytes: null };

    const backupId = randomUUID();
    const copied = await this.deps.data.backup(projectId, backupId);
    await this.deps.backups.create({ id: backupId, projectId, reason: "eject", releaseId: null, fromReleaseId: app.currentReleaseId, ...copied });
    const copy = await this.deps.copier.copy(projectId, ejectedAppDataKey(projectId, backupId)).catch((error: unknown) => {
      if (error instanceof AppSpaceError && error.code === "NO_DATA") return null;
      throw error;
    });
    return { backupId, copyBytes: copy?.bytes ?? null };
  }
}
