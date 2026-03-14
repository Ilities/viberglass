import db from "../../persistence/config/database";

/**
 * Database queries for job sweepers.
 * Used by OrphanSweeper and HeartbeatSweeper to detect stuck/stale jobs.
 */

/**
 * Find jobs that have been active for longer than the cutoff time.
 * Used by OrphanSweeper to detect stuck jobs.
 */
export async function findOrphanedJobs(
  cutoffTime: Date,
): Promise<Array<{ id: string; started_at: Date }>> {
  const jobs = await db
    .selectFrom("jobs")
    .select(["id", "started_at"])
    .where("status", "=", "active")
    .where("started_at", "<", cutoffTime)
    .execute();

  return jobs.map((job) => ({
    id: job.id,
    started_at: job.started_at!,
  }));
}

/**
 * Find jobs that have stopped sending heartbeats.
 * A job is stale if:
 * - last_heartbeat is before the stale threshold, OR
 * - last_heartbeat is NULL AND started_at is before the stale threshold (never sent progress)
 * Used by HeartbeatSweeper to detect jobs that stopped communicating.
 */
export async function findStaleJobs(
  staleThreshold: Date,
): Promise<
  Array<{ id: string; started_at: Date | null; last_heartbeat: Date | null }>
> {
  const jobs = await db
    .selectFrom("jobs")
    .select(["id", "started_at", "last_heartbeat"])
    .where("status", "=", "active")
    .where((eb) =>
      eb.or([
        eb("last_heartbeat", "<", staleThreshold),
        eb.and([
          eb("last_heartbeat", "is", null),
          eb("started_at", "<", staleThreshold),
        ]),
      ]),
    )
    .execute();

  return jobs.map((job) => ({
    id: job.id,
    started_at: job.started_at,
    last_heartbeat: job.last_heartbeat,
  }));
}
