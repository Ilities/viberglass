import { randomUUID } from "node:crypto";
import type { AppDAO, AppRecord } from "../../persistence/apps/AppDAO";
import type { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import type { AppDataStore } from "./AppDataStore";

/** The copy of an archived space's data, taken once its app has stopped. */
export class AppFinalBackup {
  constructor(
    private readonly data: Pick<AppDataStore, "backup">,
    private readonly backups: Pick<AppDataBackupDAO, "create">,
    private readonly apps: Pick<AppDAO, "clearArchiveBackup">,
  ) {}

  async take(app: AppRecord): Promise<void> {
    const id = randomUUID();
    const copied = await this.data.backup(app.projectId, id);
    await this.backups.create({ id, projectId: app.projectId, reason: "archive", releaseId: null, fromReleaseId: app.currentReleaseId, ...copied });
    await this.apps.clearArchiveBackup(app.projectId);
  }
}
