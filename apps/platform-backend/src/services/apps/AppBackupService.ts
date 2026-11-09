import type { AppDataBackup } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppDAO } from "../../persistence/apps/AppDAO";
import type { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import type { AppDataOrderDAO } from "../../persistence/apps/AppDataOrderDAO";
import type { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import type { AppReconciler } from "./AppReconciler";
import { AppSpaceError } from "./AppSpaceError";

const logger = createChildLogger({ service: "AppBackupService" });

const BACKUPS_SHOWN = 50;

/** An app's data backups: listing them, asking for one, and a schedule asking for the data back as one left it. */
export class AppBackupService {
  constructor(
    private readonly spaces: Pick<AppSpaceDAO, "findById">,
    private readonly apps: Pick<AppDAO, "get">,
    private readonly backups: Pick<AppDataBackupDAO, "list" | "getById">,
    private readonly orders: Pick<AppDataOrderDAO, "requestBackup" | "orderRestore">,
    private readonly reconciler: Pick<AppReconciler, "reconcile">,
  ) {}

  async list(projectId: string): Promise<AppDataBackup[]> {
    await this.appSpace(projectId);
    return this.backups.list(projectId, BACKUPS_SHOWN);
  }

  /** Returns at once; the app stops for the copy and starts again in the background. */
  async requestBackup(projectId: string): Promise<void> {
    await this.appSpace(projectId);
    if (!(await this.apps.get(projectId))) throw new AppSpaceError("NO_DATA", "The app has no data until its first release goes live.");
    await this.orders.requestBackup(projectId);
    this.reconcileLater(projectId);
  }

  /** False when an earlier restore hasn't run yet; that one goes first and this one isn't kept. */
  async orderRestore(projectId: string, backupId: string, executionId: string): Promise<boolean> {
    await this.appSpace(projectId);
    const backup = await this.backups.getById(backupId);
    if (!backup || backup.projectId !== projectId) throw new AppSpaceError("NO_DATA", "The backup to restore is gone.");
    if (!(await this.apps.get(projectId))) throw new AppSpaceError("NO_DATA", "The app has no data to restore yet.");
    if (!(await this.orders.orderRestore(projectId, { backupId, executionId }))) return false;
    this.reconcileLater(projectId);
    return true;
  }

  private reconcileLater(projectId: string): void {
    this.reconciler.reconcile(projectId).catch((error: unknown) => {
      logger.error("Backing up or restoring an app's data failed", { projectId, error: error instanceof Error ? error.message : String(error) });
    });
  }

  private async appSpace(projectId: string): Promise<void> {
    if (!(await this.spaces.findById(projectId))) throw new AppSpaceError("NOT_AN_APP_SPACE", "This space has no app.");
  }
}
