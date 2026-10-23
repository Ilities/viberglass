import db from "../config/database";

export interface ComparisonRecord {
  id: string;
  parentTicketId: string;
  forkedFromTurnId: string | null;
  forkedAt: Date;
  baseBranch: string | null;
  baseCommit: string | null;
  winnerTicketId: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: Date;
}

export interface ComparisonArmRecord {
  ticketId: string;
  comparisonId: string;
  key: string;
  title: string;
  status: "open" | "in_progress" | "in_review" | "resolved";
  runner: { id: string; name: string; slug: string };
  position: number;
}

export interface NewComparison {
  parentTicketId: string;
  forkedFromTurnId: string | null;
  forkedAt: Date;
  baseBranch: string | null;
  baseCommit: string | null;
  createdBy: string | null;
}

function selectComparisons() {
  return db
    .selectFrom("task_comparisons as c")
    .leftJoin("users as u", "u.id", "c.created_by")
    .selectAll("c")
    .select(["u.id as creator_id", "u.name as creator_name"]);
}

type ComparisonRow = Awaited<ReturnType<ReturnType<typeof selectComparisons>["executeTakeFirstOrThrow"]>>;

function toComparison(row: ComparisonRow): ComparisonRecord {
  return {
    id: row.id,
    parentTicketId: row.parent_ticket_id,
    forkedFromTurnId: row.forked_from_turn_id,
    forkedAt: row.forked_at,
    baseBranch: row.base_branch,
    baseCommit: row.base_commit,
    winnerTicketId: row.winner_ticket_id,
    createdBy: row.creator_id && row.creator_name ? { id: row.creator_id, name: row.creator_name } : null,
    createdAt: row.created_at,
  };
}

/** Comparisons of runners on a task, and the forked tasks each runner works on. */
export class TaskComparisonDAO {
  async create(input: NewComparison): Promise<string> {
    const row = await db
      .insertInto("task_comparisons")
      .values({
        parent_ticket_id: input.parentTicketId,
        forked_from_turn_id: input.forkedFromTurnId,
        forked_at: input.forkedAt,
        base_branch: input.baseBranch,
        base_commit: input.baseCommit,
        created_by: input.createdBy,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async addArm(comparisonId: string, ticketId: string, clankerId: string, position: number): Promise<void> {
    await db
      .insertInto("task_comparison_arms")
      .values({ comparison_id: comparisonId, ticket_id: ticketId, clanker_id: clankerId, position })
      .execute();
  }

  async get(comparisonId: string): Promise<ComparisonRecord | null> {
    const row = await selectComparisons().where("c.id", "=", comparisonId).executeTakeFirst();
    return row ? toComparison(row) : null;
  }

  /** Newest first. */
  async listForParent(parentTicketId: string): Promise<ComparisonRecord[]> {
    const rows = await selectComparisons().where("c.parent_ticket_id", "=", parentTicketId).orderBy("c.created_at", "desc").execute();
    return rows.map(toComparison);
  }

  /** The comparison a task is an arm of, and the runner it compares. */
  async armOf(ticketId: string): Promise<{ comparison: ComparisonRecord; runner: { id: string; name: string; slug: string } } | null> {
    const arm = await db
      .selectFrom("task_comparison_arms as a")
      .innerJoin("clankers as k", "k.id", "a.clanker_id")
      .select(["a.comparison_id", "k.id", "k.name", "k.slug"])
      .where("a.ticket_id", "=", ticketId)
      .executeTakeFirst();
    if (!arm) return null;
    const comparison = await this.get(arm.comparison_id);
    return comparison ? { comparison, runner: { id: arm.id, name: arm.name, slug: arm.slug } } : null;
  }

  async listArms(comparisonIds: string[]): Promise<ComparisonArmRecord[]> {
    if (comparisonIds.length === 0) return [];
    const rows = await db
      .selectFrom("task_comparison_arms as a")
      .innerJoin("tickets as t", "t.id", "a.ticket_id")
      .innerJoin("clankers as k", "k.id", "a.clanker_id")
      .select([
        "a.ticket_id",
        "a.comparison_id",
        "a.position",
        "t.task_key",
        "t.title",
        "t.ticket_status",
        "k.id as clanker_id",
        "k.name as clanker_name",
        "k.slug as clanker_slug",
      ])
      .where("a.comparison_id", "in", comparisonIds)
      .orderBy("a.position", "asc")
      .execute();
    return rows.map((row) => ({
      ticketId: row.ticket_id,
      comparisonId: row.comparison_id,
      key: row.task_key,
      title: row.title,
      status: row.ticket_status,
      runner: { id: row.clanker_id, name: row.clanker_name, slug: row.clanker_slug },
      position: row.position,
    }));
  }

  async setWinner(comparisonId: string, ticketId: string | null): Promise<void> {
    await db.updateTable("task_comparisons").set({ winner_ticket_id: ticketId }).where("id", "=", comparisonId).execute();
  }
}
