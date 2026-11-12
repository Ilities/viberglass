import { liveAppInstance, type AppHost, type AppPower, type AppRelease, type AppReleaseView, type AppView } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppDAO } from "../../persistence/apps/AppDAO";
import type { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import type { AppPreviewDAO } from "../../persistence/apps/AppPreviewDAO";
import type { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import type { AppSpaceDAO, AppSpaceRef } from "../../persistence/apps/AppSpaceDAO";
import type { TaskRefsDAO } from "../../persistence/ticketing/TaskRefsDAO";
import type { AppOrigins } from "./AppOrigins";
import type { AppReconciler } from "./AppReconciler";
import { AppSpaceError } from "./AppSpaceError";

const logger = createChildLogger({ service: "AppService" });

const RELEASES_SHOWN = 20;
const LOG_LINES = 300;

/** Build logs run to 64 KB each, so the page fetches one when it's opened. */
function withoutLog({ buildLog: _log, ...release }: AppRelease): AppReleaseView {
  return release;
}

/** An App space's app as its page shows it, and turning it on or off, for good when its space is archived. */
export class AppService {
  constructor(
    private readonly spaces: Pick<AppSpaceDAO, "findById" | "isArchived">,
    private readonly apps: Pick<AppDAO, "get" | "ensure" | "update" | "turnOffForArchive">,
    private readonly releases: Pick<AppReleaseDAO, "listForProject" | "getById">,
    private readonly backups: Pick<AppDataBackupDAO, "dataPoints">,
    private readonly reconciler: Pick<AppReconciler, "reconcile">,
    private readonly host: () => AppHost | null,
    private readonly origins: Pick<AppOrigins, "originFor">,
    private readonly previews: Pick<AppPreviewDAO, "listForProject">,
    private readonly tasks: Pick<TaskRefsDAO, "refsFor">,
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
    const previews = (await this.previews.listForProject(projectId)).filter((preview) => preview.state !== "off");
    const taskIds = [...releases.flatMap((release) => (release.ticketId ? [release.ticketId] : [])), ...previews.map((preview) => preview.ticketId)];
    const tasks = await this.tasks.refsFor(taskIds);
    return {
      power: app?.power ?? "on",
      state: app?.state ?? "off",
      statusMessage: app?.statusMessage ?? null,
      currentRelease: currentRelease && withoutLog(currentRelease),
      releases: releases.map(withoutLog),
      tasks: Object.fromEntries(tasks),
      previews: previews.map((preview) => ({ id: preview.id, taskId: preview.ticketId, state: preview.state, statusMessage: preview.statusMessage })),
      dataPoints: Object.fromEntries(dataPoints.map((point) => [point.releaseId, point.takenAt.toISOString()])),
      rollback: app?.rollback ? { releaseId: app.rollback.releaseId, withData: app.rollback.backupId !== null } : null,
      backupDue: app?.backupDue ?? false,
      dataRestoreDue: Boolean(app?.dataRestore),
      url: this.origins.originFor(space.slug),
    };
  }

  /** A release's build output; null when the release isn't this app's. */
  async buildLog(projectId: string, releaseId: string): Promise<{ buildLog: string | null } | null> {
    const release = await this.releases.getById(releaseId);
    return release && release.projectId === projectId ? { buildLog: release.buildLog } : null;
  }

  /** Records what's wanted and returns at once; starting or stopping goes on in the background. */
  async setPower(projectId: string, power: AppPower): Promise<AppView> {
    await this.appSpace(projectId);
    if (power === "on" && (await this.spaces.isArchived(projectId))) {
      throw new AppSpaceError("ARCHIVED", "This space is archived, so its app stays off.");
    }
    const app = await this.apps.ensure(projectId);
    // Turning a failed app on again is how a maintainer retries it.
    await this.apps.update(projectId, power === "on" && app.state === "failed" ? { power, state: "off", statusMessage: null } : { power });
    this.reconcileLater(projectId, power);
    return this.view(projectId);
  }

  /** Called once the space is archived; the app stops and leaves a copy of its data in the background. */
  async turnOffForArchive(projectId: string): Promise<void> {
    const app = await this.apps.get(projectId);
    if (!app) return;
    await this.apps.turnOffForArchive(projectId, app.currentReleaseId !== null);
    this.reconcileLater(projectId, "off");
  }

  async logs(projectId: string): Promise<string> {
    await this.appSpace(projectId);
    return (await this.host()?.logs(liveAppInstance(projectId), LOG_LINES)) ?? "";
  }

  private reconcileLater(projectId: string, power: AppPower): void {
    this.reconciler.reconcile(projectId).catch((error: unknown) => {
      logger.error("Turning an app on or off failed", { projectId, power, error: error instanceof Error ? error.message : String(error) });
    });
  }

  private async appSpace(projectId: string): Promise<AppSpaceRef> {
    const space = await this.spaces.findById(projectId);
    if (!space) throw new AppSpaceError("NOT_AN_APP_SPACE", "This space has no app.");
    return space;
  }
}
