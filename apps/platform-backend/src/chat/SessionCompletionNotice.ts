import type { Thread } from "chat";
import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";
import { AgentSessionDAO } from "../persistence/agentSession/AgentSessionDAO";
import { TicketPhaseDocumentService } from "../services/TicketPhaseDocumentService";
import { AGENT_SESSION_MODE } from "../types/agentSession";
import { ticketUrl } from "./platformLinks";

/**
 * Posts the end of a completed session to its chat thread: the research or
 * planning document, then links and what the person can do next.
 */
export class SessionCompletionNotice {
  constructor(
    private readonly sessionDAO = new AgentSessionDAO(),
    private readonly documentService = new TicketPhaseDocumentService(),
  ) {}

  /**
   * `hasChain` skips the "what's next" guidance when a chain will auto-advance.
   * Returns whether the thread should stay linked to the session.
   */
  async post(
    sessionId: string,
    thread: Thread,
    hasChain: boolean,
  ): Promise<{ keepLinked: boolean }> {
    let keepLinked = false;
    const session = await this.sessionDAO.getById(sessionId);
    if (session && session.mode !== AGENT_SESSION_MODE.EXECUTION) {
      const phase =
        session.mode === AGENT_SESSION_MODE.RESEARCH
          ? TICKET_WORKFLOW_PHASE.RESEARCH
          : TICKET_WORKFLOW_PHASE.PLANNING;
      const doc = await this.documentService.getOrCreateDocument(
        session.ticketId,
        phase,
      );
      if (doc.content?.trim()) {
        const filename =
          phase === TICKET_WORKFLOW_PHASE.RESEARCH
            ? "research.md"
            : "planning.md";
        await thread.post({
          markdown: `_${phase === TICKET_WORKFLOW_PHASE.RESEARCH ? "Research" : "Planning"} document:_`,
          files: [
            {
              data: Buffer.from(doc.content),
              filename,
              mimeType: "text/markdown",
            },
          ],
        });
      }
      keepLinked = true;
    }

    if (!hasChain) {
      const parts: string[] = ["*Session completed.*"];
      if (session) {
        if (
          session.mode === AGENT_SESSION_MODE.EXECUTION &&
          session.draftPullRequestUrl
        ) {
          parts.push(`[View pull request](${session.draftPullRequestUrl})`);
        }
        const url = ticketUrl(session.projectSlug ?? session.projectId, session.ticketId);
        if (url) {
          parts.push(`[View ticket](${url})`);
        }
        if (session.mode === AGENT_SESSION_MODE.RESEARCH) {
          parts.push(
            '_Mention @viberator with feedback to revise, or "plan it" to move to planning._',
          );
        } else if (session.mode === AGENT_SESSION_MODE.PLANNING) {
          parts.push(
            '_Mention @viberator with feedback to revise, or "execute" to start execution._',
          );
        }
      }
      await thread.post({ markdown: parts.join("\n") });
    }
    return { keepLinked };
  }
}
