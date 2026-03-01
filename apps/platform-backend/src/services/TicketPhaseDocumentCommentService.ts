import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketPhaseDocumentDAO } from "../persistence/ticketing/TicketPhaseDocumentDAO";
import {
  type CommentableTicketWorkflowPhase,
  type PhaseDocumentComment,
  type PhaseDocumentCommentStatus,
  PHASE_DOCUMENT_COMMENT_STATUS,
  TicketPhaseDocumentCommentDAO,
} from "../persistence/ticketing/TicketPhaseDocumentCommentDAO";

export interface PhaseDocumentCommentView {
  id: string;
  documentId: string;
  ticketId: string;
  phase: CommentableTicketWorkflowPhase;
  lineNumber: number;
  content: string;
  status: PhaseDocumentCommentStatus;
  actor: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreatePhaseDocumentCommentInput {
  lineNumber: number;
  content: string;
  actor?: string;
}

interface UpdatePhaseDocumentCommentInput {
  content?: string;
  status?: PhaseDocumentCommentStatus;
  actor?: string;
}

export class TicketPhaseDocumentCommentService {
  private readonly ticketDAO = new TicketDAO();
  private readonly documentDAO = new TicketPhaseDocumentDAO();
  private readonly commentDAO = new TicketPhaseDocumentCommentDAO();

  async listComments(
    ticketId: string,
    phase: CommentableTicketWorkflowPhase,
  ): Promise<PhaseDocumentCommentView[]> {
    await this.requireTicket(ticketId);
    const comments = await this.commentDAO.listByTicketAndPhase(ticketId, phase);
    return comments.map((comment) => this.toView(comment));
  }

  async createComment(
    ticketId: string,
    phase: CommentableTicketWorkflowPhase,
    input: CreatePhaseDocumentCommentInput,
  ): Promise<PhaseDocumentCommentView> {
    const document = await this.requireDocumentForComment(ticketId, phase);
    const content = input.content.trim();
    if (!content) {
      throw new Error("Comment content is required");
    }

    this.assertLineInRange(document.content, input.lineNumber);

    const comment = await this.commentDAO.create({
      documentId: document.id,
      ticketId,
      phase,
      lineNumber: input.lineNumber,
      content,
      actor: input.actor,
    });

    return this.toView(comment);
  }

  async updateComment(
    ticketId: string,
    phase: CommentableTicketWorkflowPhase,
    commentId: string,
    input: UpdatePhaseDocumentCommentInput,
  ): Promise<PhaseDocumentCommentView> {
    if (input.content === undefined && input.status === undefined) {
      throw new Error("At least one comment field must be provided");
    }

    const existing = await this.commentDAO.getById(ticketId, phase, commentId);
    if (!existing) {
      throw new Error("Comment not found");
    }

    const content =
      input.content === undefined ? existing.content : input.content.trim();
    if (!content) {
      throw new Error("Comment content is required");
    }

    let resolvedAt = existing.resolvedAt;
    let resolvedBy = existing.resolvedBy;
    if (input.status === PHASE_DOCUMENT_COMMENT_STATUS.OPEN) {
      resolvedAt = null;
      resolvedBy = null;
    } else if (
      input.status === PHASE_DOCUMENT_COMMENT_STATUS.RESOLVED &&
      existing.status !== PHASE_DOCUMENT_COMMENT_STATUS.RESOLVED
    ) {
      resolvedAt = new Date();
      resolvedBy = input.actor ?? null;
    }

    const updated = await this.commentDAO.update(commentId, {
      content,
      status: input.status ?? existing.status,
      resolvedAt,
      resolvedBy,
    });

    return this.toView(updated);
  }

  private async requireTicket(ticketId: string): Promise<void> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
  }

  private async requireDocumentForComment(
    ticketId: string,
    phase: CommentableTicketWorkflowPhase,
  ) {
    await this.requireTicket(ticketId);

    const document = await this.documentDAO.getByTicketAndPhase(ticketId, phase);
    if (!document || !document.content.trim()) {
      throw new Error("Cannot comment on an empty document");
    }

    return document;
  }

  private assertLineInRange(content: string, lineNumber: number): void {
    if (!Number.isInteger(lineNumber) || lineNumber < 1) {
      throw new Error("Line anchor is out of range");
    }

    const lineCount = content.split("\n").length;
    if (lineNumber > lineCount) {
      throw new Error("Line anchor is out of range");
    }
  }

  private toView(comment: PhaseDocumentComment): PhaseDocumentCommentView {
    return {
      id: comment.id,
      documentId: comment.documentId,
      ticketId: comment.ticketId,
      phase: comment.phase,
      lineNumber: comment.lineNumber,
      content: comment.content,
      status: comment.status,
      actor: comment.actor,
      resolvedAt: comment.resolvedAt?.toISOString() || null,
      resolvedBy: comment.resolvedBy,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }
}
