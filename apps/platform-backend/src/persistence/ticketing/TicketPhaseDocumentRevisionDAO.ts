import type { TicketWorkflowPhase } from "@viberglass/types";
import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";

export const PHASE_DOCUMENT_REVISION_SOURCE = {
  MANUAL: "manual",
  AGENT: "agent",
} as const;

export type PhaseDocumentRevisionSource =
  (typeof PHASE_DOCUMENT_REVISION_SOURCE)[keyof typeof PHASE_DOCUMENT_REVISION_SOURCE];

type PhaseDocumentRevisionRow =
  Selectable<Database["ticket_phase_document_revisions"]>;

export interface PhaseDocumentRevision {
  id: string;
  documentId: string;
  ticketId: string;
  phase: TicketWorkflowPhase;
  content: string;
  source: PhaseDocumentRevisionSource;
  actor: string | null;
  createdAt: Date;
}

interface CreatePhaseDocumentRevisionInput {
  documentId: string;
  ticketId: string;
  phase: TicketWorkflowPhase;
  content: string;
  source: PhaseDocumentRevisionSource;
  actor?: string;
}

export class TicketPhaseDocumentRevisionDAO {
  async create(
    input: CreatePhaseDocumentRevisionInput,
  ): Promise<PhaseDocumentRevision> {
    const row = await db
      .insertInto("ticket_phase_document_revisions")
      .values({
        document_id: input.documentId,
        ticket_id: input.ticketId,
        phase: input.phase,
        content: input.content,
        source: input.source,
        actor: input.actor ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(row);
  }

  async listByTicketAndPhase(
    ticketId: string,
    phase: TicketWorkflowPhase,
  ): Promise<PhaseDocumentRevision[]> {
    const rows = await db
      .selectFrom("ticket_phase_document_revisions")
      .selectAll()
      .where("ticket_id", "=", ticketId)
      .where("phase", "=", phase)
      .orderBy("created_at", "desc")
      .execute();

    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: PhaseDocumentRevisionRow): PhaseDocumentRevision {
    return {
      id: row.id,
      documentId: row.document_id,
      ticketId: row.ticket_id,
      phase: row.phase,
      content: row.content,
      source: row.source,
      actor: row.actor,
      createdAt: row.created_at,
    };
  }
}
