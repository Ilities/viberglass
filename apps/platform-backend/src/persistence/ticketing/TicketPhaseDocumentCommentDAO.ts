import type { TextQuote, TicketWorkflowPhase } from "@viberglass/types";
import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";

export const PHASE_DOCUMENT_COMMENT_STATUS = {
  OPEN: "open",
  RESOLVED: "resolved",
} as const;

export type PhaseDocumentCommentStatus =
  (typeof PHASE_DOCUMENT_COMMENT_STATUS)[keyof typeof PHASE_DOCUMENT_COMMENT_STATUS];

export type CommentableTicketWorkflowPhase = Extract<
  TicketWorkflowPhase,
  "research" | "planning"
>;

type PhaseDocumentCommentRow =
  Selectable<Database["ticket_phase_document_comments"]>;

export interface PhaseDocumentComment {
  id: string;
  documentId: string;
  ticketId: string;
  phase: CommentableTicketWorkflowPhase;
  /** The line the comment was placed on; a fallback for comments with no quote. */
  lineNumber: number;
  /** The text it's on; null for a comment on a blank line from before quotes. */
  quote: TextQuote | null;
  content: string;
  status: PhaseDocumentCommentStatus;
  actor: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CreatePhaseDocumentCommentInput {
  documentId: string;
  ticketId: string;
  phase: CommentableTicketWorkflowPhase;
  lineNumber: number;
  quote: TextQuote;
  content: string;
  actor?: string;
}

interface UpdatePhaseDocumentCommentInput {
  content: string;
  status: PhaseDocumentCommentStatus;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

export class TicketPhaseDocumentCommentDAO {
  async listByTicketAndPhase(
    ticketId: string,
    phase: CommentableTicketWorkflowPhase,
  ): Promise<PhaseDocumentComment[]> {
    const rows = await db
      .selectFrom("ticket_phase_document_comments")
      .selectAll()
      .where("ticket_id", "=", ticketId)
      .where("phase", "=", phase)
      .orderBy("line_number", "asc")
      .orderBy("created_at", "asc")
      .execute();

    return rows.map((row) => this.mapRow(row));
  }

  async getById(
    ticketId: string,
    phase: CommentableTicketWorkflowPhase,
    commentId: string,
  ): Promise<PhaseDocumentComment | null> {
    const row = await db
      .selectFrom("ticket_phase_document_comments")
      .selectAll()
      .where("ticket_id", "=", ticketId)
      .where("phase", "=", phase)
      .where("id", "=", commentId)
      .executeTakeFirst();

    return row ? this.mapRow(row) : null;
  }

  async create(
    input: CreatePhaseDocumentCommentInput,
  ): Promise<PhaseDocumentComment> {
    const row = await db
      .insertInto("ticket_phase_document_comments")
      .values({
        document_id: input.documentId,
        ticket_id: input.ticketId,
        phase: input.phase,
        line_number: input.lineNumber,
        quote_exact: input.quote.exact,
        quote_prefix: input.quote.prefix,
        quote_suffix: input.quote.suffix,
        content: input.content,
        actor: input.actor ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(row);
  }

  async update(
    commentId: string,
    input: UpdatePhaseDocumentCommentInput,
  ): Promise<PhaseDocumentComment> {
    const row = await db
      .updateTable("ticket_phase_document_comments")
      .set({
        content: input.content,
        status: input.status,
        resolved_at: input.resolvedAt,
        resolved_by: input.resolvedBy,
        updated_at: new Date(),
      })
      .where("id", "=", commentId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(row);
  }

  private mapRow(row: PhaseDocumentCommentRow): PhaseDocumentComment {
    return {
      id: row.id,
      documentId: row.document_id,
      ticketId: row.ticket_id,
      phase: row.phase,
      lineNumber: row.line_number,
      quote:
        row.quote_exact === null
          ? null
          : { exact: row.quote_exact, prefix: row.quote_prefix ?? "", suffix: row.quote_suffix ?? "" },
      content: row.content,
      status: row.status,
      actor: row.actor,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
