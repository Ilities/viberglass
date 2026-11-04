import type { AppRelease, AppRollbackRequest } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppDAO } from "../../persistence/apps/AppDAO";
import type { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import type { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import type { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import type { AppReconciler } from "./AppReconciler";
import { AppRollbackError } from "./AppRollbackError";
import { AppSpaceError } from "./AppSpaceError";

const logger = createChildLogger({ service: "AppRollbackService" });

/**
 * Records a maintainer's rollback to an earlier release, or forward to one an
 * earlier rollback set aside; the app's next switch carries it out.
 */
export class AppRollbackService {
  constructor(
    private readonly spaces: Pick<AppSpaceDAO, "findById">,
    private readonly apps: Pick<AppDAO, "get" | "orderRollback">,
    private readonly releases: Pick<AppReleaseDAO, "getById">,
    private readonly backups: Pick<AppDataBackupDAO, "dataPointFor">,
    private readonly reconciler: Pick<AppReconciler, "reconcile">,
  ) {}

  async restore(projectId: string, releaseId: string, request: AppRollbackRequest, requestedBy: string): Promise<void> {
    if (!(await this.spaces.findById(projectId))) throw new AppSpaceError("NOT_AN_APP_SPACE", "This space has no app.");
    const app = await this.apps.get(projectId);
    const release = await this.releases.getById(releaseId);
    if (!app || !release || release.projectId !== projectId) throw new AppRollbackError("NO_SUCH_RELEASE", "This app has no such release.");
    assertCanServe(release, app.currentReleaseId);

    const dataPoint = request.withData ? await this.backups.dataPointFor(release.id) : null;
    if (request.withData && !dataPoint) {
      throw new AppRollbackError("NO_DATA_POINT", "There's no copy of this release's data to go back to. Roll back the code only.");
    }
    await this.apps.orderRollback(projectId, { releaseId: release.id, backupId: dataPoint?.backupId ?? null, requestedBy });
    this.reconciler.reconcile(projectId).catch((error: unknown) => {
      logger.error("Rolling an app back failed", { projectId, releaseId, error: error instanceof Error ? error.message : String(error) });
    });
  }
}

function assertCanServe(release: AppRelease, currentReleaseId: string | null): void {
  if (release.id === currentReleaseId) throw new AppRollbackError("CANNOT_ROLL_BACK", "This release is already live.");
  if (release.status !== "ready" || !(release.wentLiveAt || release.rolledBackAt)) {
    throw new AppRollbackError("CANNOT_ROLL_BACK", "Only a release that was live, or was set aside by a rollback, can be made live.");
  }
  if (release.bundleRemoved) throw new AppRollbackError("CANNOT_ROLL_BACK", "This release was removed to save space.");
}
