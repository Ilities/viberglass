import type { Selectable } from "kysely";
import db from "../config/database";
import type { TicketPhaseApprovalsTable } from "../types/database";
import type { TicketWorkflowPhase } from "@viberglass/types";

export interface PhaseApprovalRecord {
  id: string;
  ticketId: string;
  phase: TicketWorkflowPhase;
  action: "approval_requested" | "approved" | "rejected" | "revoked";
  /** The person who acted; null for the system or a deleted user. */
  actorId: string | null;
  comment: string | null;
  createdAt: Date;
}

export class TicketPhaseApprovalDAO {
  async recordApprovalAction(
    ticketId: string,
    phase: TicketWorkflowPhase,
    action: "approval_requested" | "approved" | "rejected" | "revoked",
    actorId: string | null,
    comment?: string,
  ): Promise<PhaseApprovalRecord> {
    const row = await db
      .insertInto("ticket_phase_approvals")
      .values({
        ticket_id: ticketId,
        phase,
        action,
        actor_id: actorId,
        comment: comment || null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(row);
  }

  async getLatestApprovalAction(
    ticketId: string,
    phase: TicketWorkflowPhase,
  ): Promise<PhaseApprovalRecord | null> {
    const row = await db
      .selectFrom("ticket_phase_approvals")
      .selectAll()
      .where("ticket_id", "=", ticketId)
      .where("phase", "=", phase)
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst();

    if (!row) return null;
    return this.mapRow(row);
  }

  async getApprovalHistory(
    ticketId: string,
    phase: TicketWorkflowPhase,
  ): Promise<PhaseApprovalRecord[]> {
    const rows = await db
      .selectFrom("ticket_phase_approvals")
      .selectAll()
      .where("ticket_id", "=", ticketId)
      .where("phase", "=", phase)
      .orderBy("created_at", "desc")
      .execute();

    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: Selectable<TicketPhaseApprovalsTable>): PhaseApprovalRecord {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      phase: row.phase,
      action: row.action,
      actorId: row.actor_id,
      comment: row.comment,
      createdAt: row.created_at,
    };
  }
}
