import type { AppRelease, TaskActivityKind } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppReleaseReportDAO } from "../../persistence/apps/AppReleaseReportDAO";
import type { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";

const logger = createChildLogger({ service: "ReleaseTaskReporter" });

interface Report {
  kind: Extract<TaskActivityKind, "release_live" | "release_failed">;
  payload: Record<string, unknown>;
}

/**
 * Tells a task how the release of its change ended: live, live within a later
 * release, or why it didn't get there. A task whose change was made live is
 * already done, so this is how its people learn the app didn't change.
 */
export class ReleaseTaskReporter {
  constructor(
    private readonly releases: Pick<AppReleaseReportDAO, "listUnreported" | "laterLive" | "markReported">,
    private readonly activity: Pick<TaskActivityRecorder, "record">,
  ) {}

  /** Returns how many tasks it told. */
  async sweep(): Promise<number> {
    let told = 0;
    for (const release of await this.releases.listUnreported()) {
      try {
        const report = await this.reportFor(release);
        if (!release.ticketId || !report || !(await this.releases.markReported(release.id))) continue;
        await this.activity.record(release.ticketId, { type: "system" }, report.kind, report.payload);
        told++;
      } catch (error) {
        logger.warn("Couldn't tell a task how its release ended", {
          releaseId: release.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return told;
  }

  private async reportFor(release: AppRelease): Promise<Report | null> {
    const about = { releaseId: release.id, commitSha: release.commitSha };
    if (release.wentLiveAt) return { kind: "release_live", payload: about };
    if (release.status === "failed") {
      return { kind: "release_failed", payload: { ...about, reason: release.failureReason ?? "The build failed" } };
    }
    if (release.liveFailure) return { kind: "release_failed", payload: { ...about, reason: release.liveFailure } };
    const later = await this.releases.laterLive(release);
    return later ? { kind: "release_live", payload: { ...about, withCommitSha: later.commitSha } } : null;
  }
}
