import { sql } from "kysely";
import { isTaskParticipantRole, type TaskParticipantRole, type TicketLifecycleStatus } from "@viberglass/types";
import db from "../config/database";

/** A task with what its situation and a list row need. */
export interface ThreadTaskRow {
  id: string;
  key: string;
  title: string;
  status: TicketLifecycleStatus;
  pullRequestUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  spaceSlug: string;
  spaceName: string;
}

const tasksInSpaces = (projectIds: string[] | null) => {
  let query = db
    .selectFrom("tickets as t")
    .innerJoin("projects as p", "p.id", "t.project_id")
    .where("t.archived_at", "is", null);
  if (projectIds) query = query.where("t.project_id", "in", projectIds);
  return query;
};

const TASK_COLUMNS = [
  "t.id",
  "t.task_key",
  "t.title",
  "t.ticket_status",
  "t.pull_request_url",
  "t.created_at",
  "t.updated_at",
  "p.slug",
  "p.name",
] as const;

function toRow(row: {
  id: string;
  task_key: string;
  title: string;
  ticket_status: TicketLifecycleStatus;
  pull_request_url: string | null;
  created_at: Date;
  updated_at: Date;
  slug: string;
  name: string;
}): ThreadTaskRow {
  return {
    id: row.id,
    key: row.task_key,
    title: row.title,
    status: row.ticket_status,
    pullRequestUrl: row.pull_request_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    spaceSlug: row.slug,
    spaceName: row.name,
  };
}

/** The task lists Home and Overview start from. */
export class TaskThreadListDAO {
  /** Every task someone is on, in any role, in spaces they can see, latest first. */
  async listFor(userId: string, projectIds: string[] | null, limit = 200): Promise<Array<ThreadTaskRow & { roles: TaskParticipantRole[] }>> {
    if (projectIds && projectIds.length === 0) return [];
    const rows = await tasksInSpaces(projectIds)
      .innerJoin("task_participants as tp", "tp.ticket_id", "t.id")
      .select([...TASK_COLUMNS, sql<string[]>`array_agg(tp.role)`.as("roles")])
      .where("tp.user_id", "=", userId)
      .groupBy([...TASK_COLUMNS])
      .orderBy("t.updated_at", "desc")
      .limit(limit)
      .execute();
    return rows.map((row) => ({ ...toRow(row), roles: row.roles.filter(isTaskParticipantRole) }));
  }

  /** Open tasks, and those done since `doneSince`, in spaces someone can see. */
  async listCurrent(projectIds: string[] | null, doneSince: Date, limit = 500): Promise<ThreadTaskRow[]> {
    if (projectIds && projectIds.length === 0) return [];
    const rows = await tasksInSpaces(projectIds)
      .select([...TASK_COLUMNS])
      .where((eb) => eb.or([eb("t.ticket_status", "!=", "resolved"), eb("t.updated_at", ">=", doneSince)]))
      .orderBy("t.updated_at", "desc")
      .limit(limit)
      .execute();
    return rows.map(toRow);
  }
}
