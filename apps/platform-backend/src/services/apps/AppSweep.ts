import type { AppHost } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppDAO } from "../../persistence/apps/AppDAO";
import type { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import type { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import type { AppReconciler } from "./AppReconciler";

const logger = createChildLogger({ service: "AppSweep" });

/** Looks at every App space's app: new releases go live, and apps turned on or off get there. */
export class AppSweep {
  constructor(
    private readonly spaces: Pick<AppSpaceDAO, "listLiveIds">,
    private readonly apps: Pick<AppDAO, "get" | "ensure">,
    private readonly releases: Pick<AppReleaseDAO, "newestLiveCandidate">,
    private readonly reconciler: Pick<AppReconciler, "reconcile">,
    private readonly host: () => Pick<AppHost, "rejoinPlatform"> | null,
  ) {}

  /** Returns how many apps it acted on. Apps are independent, so one slow switch doesn't hold up the rest. */
  async sweep(now: Date): Promise<number> {
    await this.host()?.rejoinPlatform().catch((error: unknown) => {
      logger.warn("Could not reconnect the platform to the apps' networks", { error: error instanceof Error ? error.message : String(error) });
    });
    const ids = await this.spaces.listLiveIds();
    const acted = await Promise.all(ids.map(async (projectId) => {
      // An app comes into being with its first release.
      if (!(await this.apps.get(projectId)) && (await this.releases.newestLiveCandidate(projectId))) await this.apps.ensure(projectId);
      return this.reconciler.reconcile(projectId, now);
    }));
    return acted.filter(Boolean).length;
  }
}
