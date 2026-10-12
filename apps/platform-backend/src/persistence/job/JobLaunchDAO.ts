import { isObjectRecord } from "@viberglass/types";
import db from "../config/database";

/** What a queued job needs to start its worker later, as it was saved when the job was submitted. */
export interface QueuedJobRecord {
  id: string;
  tenantId: string;
  jobKind: string;
  task: string;
  ticketId: string | null;
  clankerId: string | null;
  callbackToken: string;
  context: Record<string, unknown>;
  settings: Record<string, unknown>;
  bootstrapPayload: Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return isObjectRecord(parsed) ? parsed : {};
}

export class JobLaunchDAO {
  /** The job while it is still queued; null once it started, ended or never existed. */
  async getQueued(jobId: string): Promise<QueuedJobRecord | null> {
    const row = await db
      .selectFrom("jobs")
      .select(["id", "tenant_id", "job_kind", "task", "ticket_id", "clanker_id", "callback_token", "context", "settings", "bootstrap_payload"])
      .where("id", "=", jobId)
      .where("status", "=", "queued")
      .executeTakeFirst();
    if (!row || !row.callback_token) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      jobKind: row.job_kind,
      task: row.task,
      ticketId: row.ticket_id,
      clankerId: row.clanker_id,
      callbackToken: row.callback_token,
      context: record(row.context),
      settings: record(row.settings),
      bootstrapPayload: record(row.bootstrap_payload),
    };
  }
}
