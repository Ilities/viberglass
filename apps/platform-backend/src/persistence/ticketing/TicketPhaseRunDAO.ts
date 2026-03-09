import db from "../config/database";
import type { Selectable } from "kysely";
import type { JobKind, TicketWorkflowPhase } from "@viberglass/types";
import type { Database } from "../types/database";

type TicketPhaseRunsRow = Selectable<Database["ticket_phase_runs"]>;
type JobsRow = Selectable<Database["jobs"]>;
type ClankersRow = Selectable<Database["clankers"]>;

type LatestPhaseRunRow = Pick<
  TicketPhaseRunsRow,
  "id" | "ticket_id" | "phase" | "job_id" | "clanker_id" | "created_at"
> &
  Pick<JobsRow, "job_kind" | "status" | "started_at" | "finished_at"> & {
    clanker_name: ClankersRow["name"] | null;
    clanker_slug: ClankersRow["slug"] | null;
  };

export interface LatestPhaseRun {
  id: string;
  ticketId: string;
  phase: TicketWorkflowPhase;
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
  async createRun(
    ticketId: string,
    jobId: string,
    clankerId: string,
    phase: TicketWorkflowPhase,
  ): Promise<void> {
    await db
      .insertInto("ticket_phase_runs")
      .values({
        ticket_id: ticketId,
        phase: phase,
        job_id: jobId,
        clanker_id: clankerId,
      })
      .execute();
  }

  async getLatestRun(
    ticketId: string,
    phase: TicketWorkflowPhase,
  ): Promise<LatestPhaseRun | null> {
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
      .where("runs.phase", "=", phase)
      .orderBy("runs.created_at", "desc")
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return this.toPhaseRunRow(row);
  }
  private toPhaseRunRow(row: LatestPhaseRunRow): LatestPhaseRun {
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
