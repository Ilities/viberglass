import { liveAppInstance, type AppHost, type AppPower, type AppView } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppDAO } from "../../persistence/apps/AppDAO";
import type { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import type { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import type { AppSpaceDAO, AppSpaceRef } from "../../persistence/apps/AppSpaceDAO";
import type { AppOrigins } from "./AppOrigins";
import type { AppReconciler } from "./AppReconciler";
import { AppSpaceError } from "./AppSpaceError";

const logger = createChildLogger({ service: "AppService" });

const RELEASES_SHOWN = 20;
const LOG_LINES = 300;

/** An App space's app as its page shows it, and turning it on or off. */
export class AppService {
  constructor(
    private readonly spaces: Pick<AppSpaceDAO, "findById">,
    private readonly apps: Pick<AppDAO, "get" | "ensure" | "update">,
    private readonly releases: Pick<AppReleaseDAO, "listForProject" | "getById">,
    private readonly backups: Pick<AppDataBackupDAO, "dataPoints">,
    private readonly reconciler: Pick<AppReconciler, "reconcile">,
    private readonly host: () => AppHost | null,
    private readonly origins: Pick<AppOrigins, "originFor">,
  ) {}

  async view(projectId: string): Promise<AppView> {
    const space = await this.appSpace(projectId);
    const app = await this.apps.get(projectId);
    const releases = await this.releases.listForProject(projectId, RELEASES_SHOWN);
    const currentId = app?.currentReleaseId ?? null;
    const currentRelease = currentId
      ? (releases.find((release) => release.id === currentId) ?? (await this.releases.getById(currentId)))
      : null;
    const dataPoints = await this.backups.dataPoints(projectId);
    return {
      power: app?.power ?? "on",
      state: app?.state ?? "off",
      statusMessage: app?.statusMessage ?? null,
      currentRelease,
      releases,
      dataPoints: Object.fromEntries(dataPoints.map((point) => [point.releaseId, point.takenAt.toISOString()])),
      rollback: app?.rollback ? { releaseId: app.rollback.releaseId, withData: app.rollback.backupId !== null } : null,
      url: this.origins.originFor(space.slug),
    };
  }

  /** Records what's wanted and returns at once; starting or stopping goes on in the background. */
  async setPower(projectId: string, power: AppPower): Promise<AppView> {
    await this.appSpace(projectId);
    const app = await this.apps.ensure(projectId);
    // Turning a failed app on again is how a maintainer retries it.
    await this.apps.update(projectId, power === "on" && app.state === "failed" ? { power, state: "off", statusMessage: null } : { power });
    this.reconciler.reconcile(projectId).catch((error: unknown) => {
      logger.error("Turning an app on or off failed", { projectId, power, error: error instanceof Error ? error.message : String(error) });
    });
    return this.view(projectId);
  }

  async logs(projectId: string): Promise<string> {
    await this.appSpace(projectId);
    return (await this.host()?.logs(liveAppInstance(projectId), LOG_LINES)) ?? "";
  }

  private async appSpace(projectId: string): Promise<AppSpaceRef> {
    const space = await this.spaces.findById(projectId);
    if (!space) throw new AppSpaceError("NOT_AN_APP_SPACE", "This space has no app.");
    return space;
  }
}
