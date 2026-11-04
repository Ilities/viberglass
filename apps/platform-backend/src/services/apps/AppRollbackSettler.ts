import type { AppRelease } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppDAO, RollbackOrder } from "../../persistence/apps/AppDAO";
import type { AppReleaseRollbackDAO } from "../../persistence/apps/AppReleaseRollbackDAO";
import type { UserDAO } from "../../persistence/user/UserDAO";
import type { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";

const logger = createChildLogger({ service: "AppRollbackSettler" });

/**
 * After a rollback went live: sets the newer releases aside so they don't go
 * live again by themselves, and tells the tasks whose changes they carried.
 */
export class AppRollbackSettler {
  constructor(
    private readonly releases: Pick<AppReleaseRollbackDAO, "setAsideAfter">,
    private readonly apps: Pick<AppDAO, "clearRollback">,
    private readonly users: Pick<UserDAO, "findById">,
    private readonly activity: Pick<TaskActivityRecorder, "record">,
  ) {}

  async settle(release: AppRelease, order: RollbackOrder): Promise<void> {
    const setAside = await this.releases.setAsideAfter(release);
    await this.apps.clearRollback(release.projectId, release.id);
    const by = (await this.users.findById(order.requestedBy))?.name ?? "Someone";
    for (const aside of setAside) {
      if (!aside.ticketId) continue;
      await this.activity
        .record(aside.ticketId, { type: "human", userId: order.requestedBy }, "release_rolled_back", {
          releaseId: aside.id,
          commitSha: aside.commitSha,
          toCommitSha: release.commitSha,
          rolledBackBy: by,
        })
        .catch((error: unknown) => {
          logger.warn("Couldn't tell a task its change was rolled back", {
            ticketId: aside.ticketId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }
  }
}
