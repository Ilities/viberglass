import type { AgentQuestion, AgentQuestionStatus } from "@viberglass/types";
import db from "../config/database";
import type { JsonValue } from "../types/database";

/** A question with what the platform needs to route, remind about and answer it. */
export interface AgentQuestionRecord extends AgentQuestion {
  ticketId: string;
  turnId: string | null;
  dueAt: Date | null;
  remindedAt: Date | null;
}

export interface CreateAgentQuestionInput {
  sessionId: string;
  turnId: string;
  jobId: string;
  question: string;
  options: string[];
  blocking: boolean;
  addresseeUserId: string | null;
  addresseeRole: string | null;
  dueAt: Date | null;
}

const STATUS: Record<string, AgentQuestionStatus> = { open: "open", resolved: "answered" };

function answerText(response: JsonValue | null): string {
  return typeof response === "object" && response !== null && !Array.isArray(response) && typeof response.answer === "string"
    ? response.answer
    : "";
}

function optionsOf(value: JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((option): option is string => typeof option === "string") : [];
}

function selectQuestions() {
  return db
    .selectFrom("agent_pending_requests as r")
    .innerJoin("agent_sessions as s", "s.id", "r.session_id")
    .innerJoin("clankers as c", "c.id", "s.clanker_id")
    .leftJoin("users as asked", "asked.id", "r.addressee_user_id")
    .leftJoin("users as answerer", "answerer.id", "r.resolved_by")
    .select([
      "r.id",
      "r.session_id",
      "r.turn_id",
      "r.status",
      "r.prompt_markdown",
      "r.options_json",
      "r.blocking",
      "r.response_json",
      "r.resolved_at",
      "r.due_at",
      "r.reminded_at",
      "r.created_at",
      "s.ticket_id",
      "c.id as clanker_id",
      "c.name as clanker_name",
      "asked.id as asked_id",
      "asked.name as asked_name",
      "answerer.id as answerer_id",
      "answerer.name as answerer_name",
    ])
    .where("r.request_type", "=", "input");
}

type QuestionRow = Awaited<ReturnType<ReturnType<typeof selectQuestions>["executeTakeFirstOrThrow"]>>;

function questionOf(row: QuestionRow): AgentQuestionRecord {
  const status = STATUS[row.status] ?? "cancelled";
  return {
    id: row.id,
    ticketId: row.ticket_id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    agent: { id: row.clanker_id, name: row.clanker_name },
    askedOf: row.asked_id && row.asked_name ? { id: row.asked_id, name: row.asked_name } : null,
    question: row.prompt_markdown,
    options: optionsOf(row.options_json),
    blocking: row.blocking,
    status,
    askedAt: row.created_at.toISOString(),
    answer:
      status === "answered" && row.resolved_at
        ? {
            by: row.answerer_id && row.answerer_name ? { id: row.answerer_id, name: row.answerer_name } : null,
            text: answerText(row.response_json),
            at: row.resolved_at.toISOString(),
          }
        : null,
    dueAt: row.due_at,
    remindedAt: row.reminded_at,
  };
}

/** The question as people see it, without the platform's routing state. */
export function publicQuestion(record: AgentQuestionRecord): AgentQuestion {
  const { id, sessionId, agent, askedOf, question, options, blocking, status, askedAt, answer } = record;
  return { id, sessionId, agent, askedOf, question, options, blocking, status, askedAt, answer };
}

/** The questions agents ask people on tasks: open input requests with an addressee. */
export class AgentQuestionDAO {
  async create(input: CreateAgentQuestionInput): Promise<string> {
    const row = await db
      .insertInto("agent_pending_requests")
      .values({
        session_id: input.sessionId,
        turn_id: input.turnId,
        job_id: input.jobId,
        request_type: "input",
        prompt_markdown: input.question,
        options_json: JSON.stringify(input.options),
        blocking: input.blocking,
        addressee_user_id: input.addresseeUserId,
        addressee_role: input.addresseeRole,
        due_at: input.dueAt,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async getById(id: string): Promise<AgentQuestionRecord | null> {
    const row = await selectQuestions().where("r.id", "=", id).executeTakeFirst();
    return row ? questionOf(row) : null;
  }

  async listForTask(ticketId: string): Promise<AgentQuestionRecord[]> {
    const rows = await selectQuestions().where("s.ticket_id", "=", ticketId).orderBy("r.created_at", "asc").execute();
    return rows.map(questionOf);
  }

  /** Each task's open questions, oldest first. */
  async listOpenForTasks(ticketIds: string[]): Promise<Map<string, AgentQuestionRecord[]>> {
    const open = new Map<string, AgentQuestionRecord[]>();
    if (ticketIds.length === 0) return open;
    const rows = await selectQuestions()
      .where("s.ticket_id", "in", ticketIds)
      .where("r.status", "=", "open")
      .orderBy("r.created_at", "asc")
      .execute();
    for (const row of rows) {
      const list = open.get(row.ticket_id) ?? [];
      list.push(questionOf(row));
      open.set(row.ticket_id, list);
    }
    return open;
  }

  /** Open questions whose reminder is due and that haven't gone to the owner yet. */
  async listDue(now: Date, limit: number): Promise<AgentQuestionRecord[]> {
    const rows = await selectQuestions()
      .where("r.status", "=", "open")
      .where("r.due_at", "<=", now)
      .where("r.escalated_at", "is", null)
      .orderBy("r.due_at", "asc")
      .limit(limit)
      .execute();
    return rows.map(questionOf);
  }

  async markReminded(id: string, nextDueAt: Date): Promise<void> {
    await db.updateTable("agent_pending_requests").set({ reminded_at: new Date(), due_at: nextDueAt, updated_at: new Date() }).where("id", "=", id).execute();
  }

  async markEscalated(id: string): Promise<void> {
    await db.updateTable("agent_pending_requests").set({ escalated_at: new Date(), updated_at: new Date() }).where("id", "=", id).execute();
  }

  /** Records the answer, unless someone answered first; returns whether this one counted. */
  async answer(id: string, answer: { by: string; text: string; messageId: string | null }): Promise<boolean> {
    const result = await db
      .updateTable("agent_pending_requests")
      .set({
        status: "resolved",
        response_json: JSON.stringify({ answer: answer.text }),
        resolved_by: answer.by,
        resolved_at: new Date(),
        answer_message_id: answer.messageId,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .where("status", "=", "open")
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  /** The question each thread message answered, by message id. */
  async questionsAnsweredBy(ticketId: string): Promise<Map<string, string>> {
    const rows = await db
      .selectFrom("agent_pending_requests as r")
      .innerJoin("agent_sessions as s", "s.id", "r.session_id")
      .select(["r.answer_message_id", "r.prompt_markdown"])
      .where("s.ticket_id", "=", ticketId)
      .where("r.answer_message_id", "is not", null)
      .execute();
    return new Map(rows.flatMap((row) => (row.answer_message_id ? [[row.answer_message_id, row.prompt_markdown]] : [])));
  }
}
