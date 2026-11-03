import type { AppDAO } from "../../persistence/apps/AppDAO";
import type { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import type { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import type { AppReconciler } from "./AppReconciler";

/** Looks at every App space's app: new releases go live, and apps turned on or off get there. */
export class AppSweep {
  constructor(
    private readonly spaces: Pick<AppSpaceDAO, "listLiveIds">,
    private readonly apps: Pick<AppDAO, "get" | "ensure">,
    private readonly releases: Pick<AppReleaseDAO, "newestLiveCandidate">,
    private readonly reconciler: Pick<AppReconciler, "reconcile">,
  ) {}

  /** Returns how many apps it acted on. Apps are independent, so one slow switch doesn't hold up the rest. */
  async sweep(now: Date): Promise<number> {
    const ids = await this.spaces.listLiveIds();
    const acted = await Promise.all(ids.map(async (projectId) => {
      // An app comes into being with its first release.
      if (!(await this.apps.get(projectId)) && (await this.releases.newestLiveCandidate(projectId))) await this.apps.ensure(projectId);
      return this.reconciler.reconcile(projectId, now);
    }));
    return acted.filter(Boolean).length;
  }
}
