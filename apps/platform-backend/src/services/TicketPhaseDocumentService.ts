import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { TicketWorkflowPhase } from "@viberglass/types";
import { createChildLogger } from "../config/logger";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import {
  type ApprovalState,
  type PhaseDocument,
  TicketPhaseDocumentDAO,
} from "../persistence/ticketing/TicketPhaseDocumentDAO";
import {
  PHASE_DOCUMENT_REVISION_SOURCE,
  type PhaseDocumentRevisionSource,
  TicketPhaseDocumentRevisionDAO,
} from "../persistence/ticketing/TicketPhaseDocumentRevisionDAO";
import { TicketLifecycleStatusService } from "./TicketLifecycleStatusService";

const logger = createChildLogger({ service: "TicketPhaseDocumentService" });

export interface PhaseDocumentView {
  id: string;
  ticketId: string;
  phase: TicketWorkflowPhase;
  content: string;
  approvalState: ApprovalState;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SaveDocumentOptions {
  actor?: string;
  source?: PhaseDocumentRevisionSource;
}

export class TicketPhaseDocumentService {
  private readonly ticketDAO = new TicketDAO();
  private readonly documentDAO = new TicketPhaseDocumentDAO();
  private readonly revisionDAO = new TicketPhaseDocumentRevisionDAO();
  private readonly lifecycleStatusService = new TicketLifecycleStatusService();
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET?.trim() || "";
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || "eu-west-1",
    });
  }

  async getOrCreateDocument(
    ticketId: string,
    phase: TicketWorkflowPhase,
  ): Promise<PhaseDocumentView> {
    await this.requireTicket(ticketId);
    const doc = await this.getOrCreatePersistedDocument(ticketId, phase);
    return this.toView(doc);
  }

  async saveDocument(
    ticketId: string,
    phase: TicketWorkflowPhase,
    content: string,
    options: SaveDocumentOptions = {},
  ): Promise<PhaseDocumentView> {
    await this.requireTicket(ticketId);
    const doc = await this.getOrCreatePersistedDocument(ticketId, phase);

    let storageUrl: string | null = doc.storageUrl;

    if (this.bucketName) {
      try {
        const key = `ticket-phase-docs/${ticketId}/${phase}/document.md`;
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: content,
            ContentType: "text/markdown; charset=utf-8",
          }),
        );
        storageUrl = `s3://${this.bucketName}/${key}`;
      } catch (error) {
        logger.warn("Failed to upload phase document to S3, DB content saved", {
          ticketId,
          phase,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.documentDAO.updateContent(doc.id, content, storageUrl);
    await this.revisionDAO.create({
      documentId: doc.id,
      ticketId,
      phase,
      content,
      source: options.source ?? PHASE_DOCUMENT_REVISION_SOURCE.MANUAL,
      actor: options.actor,
    });

    if (
      options.source !== PHASE_DOCUMENT_REVISION_SOURCE.AGENT &&
      content.trim().length > 0 &&
      doc.approvalState !== "approval_requested"
    ) {
      await this.documentDAO.updateApprovalState(
        ticketId,
        phase,
        "approval_requested",
        options.actor,
      );
    }

    await this.lifecycleStatusService.synchronize(ticketId);

    const updated = await this.documentDAO.getByTicketAndPhase(ticketId, phase);
    return this.toView(updated!);
  }

  async requestApproval(
    ticketId: string,
    phase: TicketWorkflowPhase,
    actor?: string,
  ): Promise<PhaseDocumentView> {
    await this.requireTicket(ticketId);
    await this.getOrCreatePersistedDocument(ticketId, phase);

    await this.documentDAO.updateApprovalState(
      ticketId,
      phase,
      "approval_requested",
      actor,
    );
    await this.lifecycleStatusService.synchronize(ticketId);

    const updated = await this.documentDAO.getByTicketAndPhase(ticketId, phase);
    return this.toView(updated!);
  }

  async approveDocument(
    ticketId: string,
    phase: TicketWorkflowPhase,
    actor?: string,
  ): Promise<PhaseDocumentView> {
    await this.requireTicket(ticketId);
    await this.getOrCreatePersistedDocument(ticketId, phase);

    await this.documentDAO.updateApprovalState(ticketId, phase, "approved", actor);
    await this.lifecycleStatusService.synchronize(ticketId);

    const updated = await this.documentDAO.getByTicketAndPhase(ticketId, phase);
    return this.toView(updated!);
  }

  async revokeApproval(
    ticketId: string,
    phase: TicketWorkflowPhase,
    actor?: string,
  ): Promise<PhaseDocumentView> {
    await this.requireTicket(ticketId);
    await this.getOrCreatePersistedDocument(ticketId, phase);

    await this.documentDAO.updateApprovalState(
      ticketId,
      phase,
      "draft",
      actor,
    );
    await this.lifecycleStatusService.synchronize(ticketId);

    const updated = await this.documentDAO.getByTicketAndPhase(ticketId, phase);
    return this.toView(updated!);
  }

  private async requireTicket(ticketId: string): Promise<void> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
  }

  private async getOrCreatePersistedDocument(
    ticketId: string,
    phase: TicketWorkflowPhase,
  ): Promise<PhaseDocument> {
    const existing = await this.documentDAO.getByTicketAndPhase(ticketId, phase);
    if (existing) {
      return existing;
    }

    return this.documentDAO.create(ticketId, phase);
  }

  private toView(doc: PhaseDocument): PhaseDocumentView {
    return {
      id: doc.id,
      ticketId: doc.ticketId,
      phase: doc.phase,
      content: doc.content,
      approvalState: doc.approvalState,
      approvedAt: doc.approvedAt?.toISOString() || null,
      approvedBy: doc.approvedBy,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}
