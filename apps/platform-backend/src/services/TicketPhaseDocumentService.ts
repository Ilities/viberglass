import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { objectStorageBucket, objectStorageClientConfig, type TicketWorkflowPhase } from "@viberglass/types";
import { createChildLogger } from "../config/logger";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { type PhaseDocument, TicketPhaseDocumentDAO } from "../persistence/ticketing/TicketPhaseDocumentDAO";
import {
  PHASE_DOCUMENT_REVISION_SOURCE,
  type PhaseDocumentRevisionSource,
  TicketPhaseDocumentRevisionDAO,
} from "../persistence/ticketing/TicketPhaseDocumentRevisionDAO";
import { TicketLifecycleStatusService } from "./TicketLifecycleStatusService";
import { TaskActivityRecorder } from "./tasks/TaskActivityRecorder";

const logger = createChildLogger({ service: "TicketPhaseDocumentService" });

export interface PhaseDocumentView {
  id: string;
  ticketId: string;
  phase: TicketWorkflowPhase;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface SaveDocumentOptions {
  actor?: string;
  source?: PhaseDocumentRevisionSource;
  /** The agent turn that wrote it. */
  agentTurnId?: string;
}

export class TicketPhaseDocumentService {
  private readonly ticketDAO = new TicketDAO();
  private readonly documentDAO = new TicketPhaseDocumentDAO();
  private readonly revisionDAO = new TicketPhaseDocumentRevisionDAO();
  private readonly activity = new TaskActivityRecorder();
  private readonly lifecycleStatusService = new TicketLifecycleStatusService();
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor() {
    this.bucketName = objectStorageBucket(process.env);
    this.s3Client = new S3Client(objectStorageClientConfig(process.env));
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
      agentTurnId: options.agentTurnId,
    });
    // The agent's documents show up as its run finishing; a person's edit is its own entry.
    if (options.source !== PHASE_DOCUMENT_REVISION_SOURCE.AGENT) {
      await this.activity.recordByCurrentActor(ticketId, "document_edited", { step: phase });
    }

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
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}
