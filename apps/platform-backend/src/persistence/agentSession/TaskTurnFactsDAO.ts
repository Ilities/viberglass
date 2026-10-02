import { sql } from "kysely";
import { isObjectRecord, isTaskTurnAction, type JobFailureCategory, type TaskTurnAction } from "@viberglass/types";
import db from "../config/database";
import type { JsonValue } from "../types/database";
import { outcomeOf } from "./turnOutcomeJson";

export interface FinishedTurnFact {
  status: "completed" | "failed" | "cancelled";
  at: Date;
  failure: { title?: string; category?: JobFailureCategory } | null;
  agent: { id: string; name: string };
  intent: string | null;
}

export interface TurnAggregateFact {
  /** Builds that committed code, and when the latest did. */
  codeTurns: number;
  lastCodeAt: Date | null;
  /** When the agent last answered without producing anything: a reply in the thread. */
  lastReplyAt: Date | null;
}

const FINISHED = ["completed", "failed", "cancelled"] as const;
const isFinished = (status: string): status is FinishedTurnFact["status"] => FINISHED.some((value) => value === status);
const CATEGORIES: readonly JobFailureCategory[] = ["setup", "agent", "platform"];

function failureOf(result: JsonValue | null): FinishedTurnFact["failure"] {
  const failure = isObjectRecord(result) ? result.failure : null;
  if (!isObjectRecord(failure)) return null;
  const { title } = failure;
  const category = CATEGORIES.find((value) => value === failure.category);
  return { ...(typeof title === "string" && { title }), ...(category && { category }) };
}

const assistantTurns = (ticketIds: string[]) =>
  db
    .selectFrom("agent_turns as t")
    .innerJoin("agent_sessions as s", "s.id", "t.session_id")
    .where("s.ticket_id", "in", ticketIds)
    .where("t.role", "=", "assistant")
    .where("t.action", "is not", null);

/** What the agent's turns say about many tasks at once, for their situations. */
export class TaskTurnFactsDAO {
  /** The turn running on each task now, if any. */
  async running(ticketIds: string[]): Promise<Map<string, { action: TaskTurnAction; since: Date }>> {
    if (ticketIds.length === 0) return new Map();
    const rows = await assistantTurns(ticketIds)
      .where("t.status", "in", ["queued", "running"])
      .distinctOn("s.ticket_id")
      .select(["s.ticket_id", "t.action", sql<Date>`coalesce(t.started_at, t.created_at)`.as("since")])
      .orderBy("s.ticket_id")
      .orderBy("t.created_at", "desc")
      .execute();
    return new Map(rows.flatMap((row) => (isTaskTurnAction(row.action) ? [[row.ticket_id, { action: row.action, since: row.since }]] : [])));
  }

  /** Tasks whose agent someone paused, and since when. */
  async paused(ticketIds: string[]): Promise<Map<string, Date>> {
    if (ticketIds.length === 0) return new Map();
    const rows = await db
      .selectFrom("agent_sessions")
      .select(["ticket_id", "updated_at"])
      .where("ticket_id", "in", ticketIds)
      .where("status", "=", "paused")
      .execute();
    return new Map(rows.map((row) => [row.ticket_id, row.updated_at]));
  }

  /** Each task's latest finished turn, with why it failed. */
  async lastFinished(ticketIds: string[]): Promise<Map<string, FinishedTurnFact>> {
    if (ticketIds.length === 0) return new Map();
    const rows = await assistantTurns(ticketIds)
      .innerJoin("clankers as c", "c.id", "s.clanker_id")
      .leftJoin("jobs as j", "j.id", "t.job_id")
      .where("t.status", "in", [...FINISHED])
      .distinctOn("s.ticket_id")
      .select([
        "s.ticket_id",
        "t.status",
        "t.content_json",
        "j.result",
        "c.id as clanker_id",
        "c.name as clanker_name",
        sql<Date>`coalesce(t.completed_at, t.updated_at)`.as("at"),
      ])
      .orderBy("s.ticket_id")
      .orderBy(sql`coalesce(t.completed_at, t.updated_at)`, "desc")
      .execute();
    return new Map(
      rows.flatMap((row) =>
        isFinished(row.status)
          ? [
              [
                row.ticket_id,
                {
                  status: row.status,
                  at: row.at,
                  failure: row.status === "failed" ? failureOf(row.result) : null,
                  agent: { id: row.clanker_id, name: row.clanker_name },
                  intent: outcomeOf(row.content_json)?.intent ?? null,
                },
              ],
            ]
          : [],
      ),
    );
  }

  async aggregates(ticketIds: string[]): Promise<Map<string, TurnAggregateFact>> {
    if (ticketIds.length === 0) return new Map();
    const produced = sql`coalesce(t.content_json->'produced', '[]'::jsonb)`;
    const rows = await assistantTurns(ticketIds)
      .where("t.status", "=", "completed")
      .select([
        "s.ticket_id",
        sql<string>`count(*) filter (where ${produced} ? 'code')`.as("code_turns"),
        sql<Date | null>`max(t.completed_at) filter (where ${produced} ? 'code')`.as("last_code_at"),
        sql<Date | null>`max(t.completed_at) filter (where jsonb_array_length(${produced}) = 0)`.as("last_reply_at"),
      ])
      .groupBy("s.ticket_id")
      .execute();
    return new Map(
      rows.map((row) => [row.ticket_id, { codeTurns: Number(row.code_turns), lastCodeAt: row.last_code_at, lastReplyAt: row.last_reply_at }]),
    );
  }
}
