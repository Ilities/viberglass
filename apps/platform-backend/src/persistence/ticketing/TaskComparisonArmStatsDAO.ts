import { sql } from "kysely";
import type { TaskComparisonArm } from "@viberglass/types";
import db from "../config/database";
import { outcomeOf } from "../agentSession/turnOutcomeJson";

export type ArmStats = Omit<TaskComparisonArm, "ticketId" | "key" | "title" | "status" | "runner">;

const NO_RUNS: ArmStats = {
  running: false,
  runs: 0,
  lastRunStatus: null,
  intent: null,
  pullRequestUrl: null,
  branch: null,
  commit: null,
  model: null,
  costUsd: null,
  durationMs: null,
};

/** What each arm's runs did so far, read for comparing them side by side. */
export class TaskComparisonArmStatsDAO {
  async statsFor(ticketIds: string[]): Promise<Map<string, ArmStats>> {
    const stats = new Map<string, ArmStats>(ticketIds.map((id) => [id, { ...NO_RUNS }]));
    if (ticketIds.length === 0) return stats;

    const [totals, latestJobs, latestCommits, pullRequests, latestTurns] = await Promise.all([
      db
        .selectFrom("jobs as j")
        .leftJoin("job_run_manifests as m", "m.job_id", "j.id")
        .select([
          "j.ticket_id",
          sql<string>`count(*)`.as("runs"),
          sql<boolean>`bool_or(j.status in ('queued', 'active'))`.as("running"),
          sql<string | null>`sum(m.cost_usd)`.as("cost_usd"),
          sql<string | null>`sum(m.duration_ms)`.as("duration_ms"),
        ])
        .where("j.ticket_id", "in", ticketIds)
        .groupBy("j.ticket_id")
        .execute(),
      db
        .selectFrom("jobs as j")
        .leftJoin("job_run_manifests as m", "m.job_id", "j.id")
        .distinctOn("j.ticket_id")
        .select(["j.ticket_id", "j.status", "m.model_snapshot"])
        .where("j.ticket_id", "in", ticketIds)
        .orderBy("j.ticket_id")
        .orderBy("j.created_at", "desc")
        .execute(),
      db
        .selectFrom("job_run_manifests")
        .distinctOn("ticket_id")
        .select(["ticket_id", "commit_sha", "branch"])
        .where("ticket_id", "in", ticketIds)
        .where("commit_sha", "is not", null)
        .orderBy("ticket_id")
        .orderBy("finished_at", "desc")
        .execute(),
      db
        .selectFrom("task_pull_requests")
        .distinctOn("ticket_id")
        .select(["ticket_id", "url", "branch"])
        .where("ticket_id", "in", ticketIds)
        .orderBy("ticket_id")
        .orderBy("created_at", "desc")
        .execute(),
      db
        .selectFrom("agent_turns")
        .innerJoin("agent_sessions", "agent_sessions.id", "agent_turns.session_id")
        .distinctOn("agent_sessions.ticket_id")
        .select(["agent_sessions.ticket_id", "agent_turns.content_json"])
        .where("agent_sessions.ticket_id", "in", ticketIds)
        .where("agent_turns.role", "=", "assistant")
        .where("agent_turns.content_json", "is not", null)
        .orderBy("agent_sessions.ticket_id")
        .orderBy("agent_turns.created_at", "desc")
        .execute(),
    ]);

    const update = (ticketId: string | null, change: Partial<ArmStats>) => {
      const current = ticketId ? stats.get(ticketId) : undefined;
      if (ticketId && current) stats.set(ticketId, { ...current, ...change });
    };
    for (const row of totals) {
      update(row.ticket_id, {
        runs: Number(row.runs),
        running: Boolean(row.running),
        costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
        durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
      });
    }
    for (const row of latestJobs) update(row.ticket_id, { lastRunStatus: row.status, model: row.model_snapshot });
    for (const row of latestCommits) update(row.ticket_id, { commit: row.commit_sha, branch: row.branch });
    for (const row of pullRequests) {
      const current = stats.get(row.ticket_id);
      update(row.ticket_id, { pullRequestUrl: row.url, branch: current?.branch ?? row.branch });
    }
    for (const row of latestTurns) update(row.ticket_id, { intent: outcomeOf(row.content_json)?.intent ?? null });
    return stats;
  }
}
