import type { AppDAO } from "../../persistence/apps/AppDAO";
import type { AppPreviewDAO } from "../../persistence/apps/AppPreviewDAO";
import { AppSpaceError } from "./AppSpaceError";

// The reconcilers' limit: a claim older than this died with its process.
const BUSY_STALE_MS = 15 * 60 * 1000;

export interface ClaimedApp {
  previewIds: string[];
  /** Ends every claim taken; not needed when the rows go anyway. */
  release(): Promise<void>;
}

/** Claims an App space's app and every preview at once, so nothing starts or stops them while the space is taken apart. */
export class AppClaims {
  constructor(
    private readonly apps: Pick<AppDAO, "get" | "claim" | "finish">,
    private readonly previews: Pick<AppPreviewDAO, "listForProject" | "claim" | "finish">,
  ) {}

  /** Throws APP_BUSY while the app or a preview is starting or stopping, having released what it claimed. */
  async claimAll(projectId: string, now = new Date()): Promise<ClaimedApp> {
    const staleBefore = new Date(now.getTime() - BUSY_STALE_MS);
    const releases: Array<() => Promise<void>> = [];
    const release = async () => {
      await Promise.all(releases.map((one) => one()));
    };
    try {
      if (await this.apps.get(projectId)) {
        if (!(await this.apps.claim(projectId, staleBefore))) throw busy();
        releases.push(() => this.apps.finish(projectId, {}));
      }
      const previewIds: string[] = [];
      for (const preview of await this.previews.listForProject(projectId)) {
        if (!(await this.previews.claim(preview.id, staleBefore))) throw busy();
        releases.push(() => this.previews.finish(preview.id, {}));
        previewIds.push(preview.id);
      }
      return { previewIds, release };
    } catch (error) {
      await release();
      throw error;
    }
  }
}

function busy(): AppSpaceError {
  return new AppSpaceError("APP_BUSY", "The app or one of its previews is starting or stopping. Try again in a minute.");
}
