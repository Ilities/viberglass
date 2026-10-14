import { isObjectRecord, type RunnerLastRun } from "@viberglass/types";
import db from "../config/database";

function failureField(result: unknown, field: "code" | "title"): string | null {
  if (!isObjectRecord(result) || !isObjectRecord(result.failure)) return null;
  const value = result.failure[field];
  return typeof value === "string" ? value : null;
}

const FINISHED: readonly RunnerLastRun["status"][] = ["completed", "failed", "cancelled"];

function isFinished(status: string): status is RunnerLastRun["status"] {
  return FINISHED.some((finished) => finished === status);
}

/** Each runner's latest run that ended in one of `statuses`: whether its agent last worked, or why it didn't. */
export class RunnerLastRunDAO {
  async latestFinishedByClanker(
    clankerIds: string[],
    statuses: readonly RunnerLastRun["status"][] = FINISHED,
  ): Promise<Map<string, RunnerLastRun>> {
    const latest = new Map<string, RunnerLastRun>();
    if (clankerIds.length === 0) return latest;
    const rows = await db
      .selectFrom("jobs")
      .distinctOn("clanker_id")
      .select(["clanker_id", "status", "result", "finished_at"])
      .where("clanker_id", "in", clankerIds)
      .where("status", "in", statuses)
      .where("finished_at", "is not", null)
      .orderBy("clanker_id")
      .orderBy("finished_at", "desc")
      .execute();
    for (const row of rows) {
      if (!row.clanker_id || !row.finished_at || !isFinished(row.status)) continue;
      latest.set(row.clanker_id, {
        status: row.status,
        failureCode: row.status === "failed" ? failureField(row.result, "code") : null,
        failureTitle: row.status === "failed" ? failureField(row.result, "title") : null,
        at: new Date(row.finished_at).toISOString(),
      });
    }
    return latest;
  }
}
