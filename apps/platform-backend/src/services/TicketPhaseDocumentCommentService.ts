import { locateQuote, quoteForLine, TICKET_WORKFLOW_PHASE, type QuoteLocation, type TextQuote } from "@viberglass/types";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketPhaseDocumentDAO } from "../persistence/ticketing/TicketPhaseDocumentDAO";
import {
  type PhaseDocumentComment,
  type PhaseDocumentCommentStatus,
  PHASE_DOCUMENT_COMMENT_STATUS,
  TicketPhaseDocumentCommentDAO,
} from "../persistence/ticketing/TicketPhaseDocumentCommentDAO";
import { TaskActivityRecorder } from "./tasks/TaskActivityRecorder";

/** How much of a comment's quote its Activity entry keeps. */
const QUOTE_IN_ACTIVITY = 80;
/** Enough of a comment for the thread to show what was asked; the full text is on the document. */
const COMMENT_IN_ACTIVITY = 600;
// Comments are on the plan, the one document a task has.
const PLAN = TICKET_WORKFLOW_PHASE.PLANNING;

export interface PhaseDocumentCommentView {
  id: string;
  documentId: string;
  ticketId: string;
  /** Where the comment is in the document now, else the line it was placed on. */
  lineNumber: number;
  quote: TextQuote | null;
  /** Where the quote is in the current document; null when its text is gone or it has none. */
  location: QuoteLocation | null;
  /** The quoted text is no longer in the document. */
  outdated: boolean;
  content: string;
  status: PhaseDocumentCommentStatus;
  actor: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A comment is placed on quoted text (from the rendered document) or, failing that, on a whole line. */
interface CreatePhaseDocumentCommentInput {
  quote?: TextQuote;
  lineNumber?: number;
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
  private readonly activity = new TaskActivityRecorder();

  async listComments(ticketId: string): Promise<PhaseDocumentCommentView[]> {
    await this.requireTicket(ticketId);
    const [comments, document] = await Promise.all([
      this.commentDAO.listByTicketAndPhase(ticketId, PLAN),
      this.documentDAO.getByTicketAndPhase(ticketId, PLAN),
    ]);
    return comments
      .map((comment) => this.toView(comment, document?.content ?? ""))
      .sort((a, b) => (a.location?.start ?? Infinity) - (b.location?.start ?? Infinity) || a.lineNumber - b.lineNumber);
  }

  async createComment(
    ticketId: string,
    input: CreatePhaseDocumentCommentInput,
  ): Promise<PhaseDocumentCommentView> {
    const document = await this.requireDocumentForComment(ticketId);
    const content = input.content.trim();
    if (!content) {
      throw new Error("Comment content is required");
    }

    const quote = this.quoteFor(document.content, input);
    const location = locateQuote(document.content, quote, input.lineNumber);
    if (!location) {
      throw new Error("The quoted text isn't in the document");
    }

    const comment = await this.commentDAO.create({
      documentId: document.id,
      ticketId,
      phase: PLAN,
      lineNumber: location.line,
      quote,
      content,
      actor: input.actor,
    });
    await this.activity.recordByCurrentActor(ticketId, "comment_added", {
      step: PLAN,
      quote: quote.exact.slice(0, QUOTE_IN_ACTIVITY),
      commentId: comment.id,
      comment: content.slice(0, COMMENT_IN_ACTIVITY),
    });

    return this.toView(comment, document.content);
  }

  async updateComment(
    ticketId: string,
    commentId: string,
    input: UpdatePhaseDocumentCommentInput,
  ): Promise<PhaseDocumentCommentView> {
    if (input.content === undefined && input.status === undefined) {
      throw new Error("At least one comment field must be provided");
    }

    const existing = await this.commentDAO.getById(ticketId, PLAN, commentId);
    if (!existing) {
      throw new Error("Comment not found");
    }

    const content =
      input.content === undefined ? existing.content : input.content.trim();
    if (!content) {
      throw new Error("Comment content is required");
    }
    // Anyone on the task may resolve or reopen a comment, but only its author may reword it.
    if (content !== existing.content && (existing.actor ?? null) !== (input.actor ?? null)) {
      throw new Error("Only the comment's author can edit it");
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
    if (updated.status !== existing.status) {
      await this.activity.recordByCurrentActor(ticketId, "comment_status_changed", { step: PLAN, commentId, status: updated.status });
    }
    const document = await this.documentDAO.getByTicketAndPhase(ticketId, PLAN);

    return this.toView(updated, document?.content ?? "");
  }

  private async requireTicket(ticketId: string): Promise<void> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
  }

  private async requireDocumentForComment(ticketId: string) {
    await this.requireTicket(ticketId);

    const document = await this.documentDAO.getByTicketAndPhase(ticketId, PLAN);
    if (!document || !document.content.trim()) {
      throw new Error("Cannot comment on an empty document");
    }

    return document;
  }

  private quoteFor(content: string, input: CreatePhaseDocumentCommentInput): TextQuote {
    if (input.quote) {
      if (!input.quote.exact.trim()) throw new Error("Pick some text to comment on");
      return input.quote;
    }
    const lineNumber = input.lineNumber ?? 0;
    const quote = Number.isInteger(lineNumber) ? quoteForLine(content, lineNumber) : null;
    if (!quote) throw new Error("Line anchor is out of range");
    return quote;
  }

  /** Finds the comment's text again in the document as it reads now. */
  private toView(comment: PhaseDocumentComment, documentContent: string): PhaseDocumentCommentView {
    const location = comment.quote ? locateQuote(documentContent, comment.quote, comment.lineNumber) : null;
    return {
      id: comment.id,
      documentId: comment.documentId,
      ticketId: comment.ticketId,
      lineNumber: location?.line ?? comment.lineNumber,
      quote: comment.quote,
      location,
      outdated: comment.quote !== null && location === null,
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
