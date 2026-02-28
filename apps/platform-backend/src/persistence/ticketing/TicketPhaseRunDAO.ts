import db from "../config/database";
import type { JobKind } from "@viberglass/types";

export interface LatestPhaseRun {
  id: string;
  ticketId: string;
  phase: "research";
  jobId: string;
  clankerId: string;
  clankerName: string | null;
  clankerSlug: string | null;
  jobKind: JobKind;
  status: "queued" | "active" | "completed" | "failed";
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export class TicketPhaseRunDAO {
  async createResearchRun(
    ticketId: string,
    jobId: string,
    clankerId: string,
  ): Promise<void> {
    await db
      .insertInto("ticket_phase_runs")
      .values({
        ticket_id: ticketId,
        phase: "research",
        job_id: jobId,
        clanker_id: clankerId,
      })
      .execute();
  }

  async getLatestResearchRun(ticketId: string): Promise<LatestPhaseRun | null> {
    const row = await db
      .selectFrom("ticket_phase_runs as runs")
      .innerJoin("jobs", "jobs.id", "runs.job_id")
      .innerJoin("clankers", "clankers.id", "runs.clanker_id")
      .select([
        "runs.id",
        "runs.ticket_id",
        "runs.phase",
        "runs.job_id",
        "runs.clanker_id",
        "runs.created_at",
        "jobs.job_kind",
        "jobs.status",
        "jobs.started_at",
        "jobs.finished_at",
        "clankers.name as clanker_name",
        "clankers.slug as clanker_slug",
      ])
      .where("runs.ticket_id", "=", ticketId)
      .where("runs.phase", "=", "research")
      .orderBy("runs.created_at", "desc")
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      ticketId: row.ticket_id,
      phase: row.phase,
      jobId: row.job_id,
      clankerId: row.clanker_id,
      clankerName: row.clanker_name,
      clankerSlug: row.clanker_slug,
      jobKind: row.job_kind,
      status: row.status,
      createdAt: row.created_at,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    };
  }
}
