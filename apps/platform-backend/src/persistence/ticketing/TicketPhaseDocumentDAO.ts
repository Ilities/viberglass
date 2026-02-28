import db from "../config/database";
import type { TicketWorkflowPhase } from "@viberglass/types";

export interface PhaseDocument {
  id: string;
  ticketId: string;
  phase: TicketWorkflowPhase;
  content: string;
  storageUrl: string | null;
  approvalState: "draft" | "approval_requested" | "approved" | "rejected";
  approvedAt: Date | null;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ApprovalState = PhaseDocument["approvalState"];

export class TicketPhaseDocumentDAO {
  async getByTicketAndPhase(
    ticketId: string,
    phase: TicketWorkflowPhase,
  ): Promise<PhaseDocument | null> {
    const row = await db
      .selectFrom("ticket_phase_documents")
      .selectAll()
      .where("ticket_id", "=", ticketId)
      .where("phase", "=", phase)
      .executeTakeFirst();

    if (!row) return null;
    return this.mapRow(row);
  }

  async create(
    ticketId: string,
    phase: TicketWorkflowPhase,
  ): Promise<PhaseDocument> {
    const row = await db
      .insertInto("ticket_phase_documents")
      .values({
        ticket_id: ticketId,
        phase,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(row);
  }

  async updateContent(
    id: string,
    content: string,
    storageUrl: string | null,
  ): Promise<void> {
    await db
      .updateTable("ticket_phase_documents")
      .set({
        content,
        storage_url: storageUrl,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
  }

  async updateApprovalState(
    ticketId: string,
    phase: TicketWorkflowPhase,
    approvalState: ApprovalState,
    approvedBy?: string,
  ): Promise<PhaseDocument> {
    const updateData: Record<string, unknown> = {
      approval_state: approvalState,
      updated_at: new Date(),
    };

    if (approvalState === "approved") {
      updateData.approved_at = new Date();
      updateData.approved_by = approvedBy || null;
    } else if (approvalState === "draft") {
      // When reverting to draft, clear approval info
      updateData.approved_at = null;
      updateData.approved_by = null;
    }

    await db
      .updateTable("ticket_phase_documents")
      .set(updateData)
      .where("ticket_id", "=", ticketId)
      .where("phase", "=", phase)
      .execute();

    const updated = await this.getByTicketAndPhase(ticketId, phase);
    if (!updated) {
      throw new Error("Document not found after approval state update");
    }
    return updated;
  }

  private mapRow(row: {
    id: string;
    ticket_id: string;
    phase: string;
    content: string;
    storage_url: string | null;
    approval_state: string;
    approved_at: Date | null;
    approved_by: string | null;
    created_at: Date;
    updated_at: Date;
  }): PhaseDocument {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      phase: row.phase as TicketWorkflowPhase,
      content: row.content,
      storageUrl: row.storage_url,
      approvalState: row.approval_state as ApprovalState,
      approvedAt: row.approved_at,
      approvedBy: row.approved_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
