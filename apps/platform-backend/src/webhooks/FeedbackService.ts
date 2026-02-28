import { createChildLogger } from "../config/logger";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import type { WebhookConfigDAO } from "../persistence/webhook/WebhookConfigDAO";
import type { JobResult } from "../types/Job";
import { FeedbackEventDispatcher } from "./feedback/FeedbackEventDispatcher";
import type {
  FeedbackResult,
  FeedbackServiceConfig,
  JobWithTicket,
  ResearchApprovalEvent,
} from "./feedback/types";
import type { ProviderRegistry } from "./ProviderRegistry";

export type {
  FeedbackResult,
  FeedbackServiceConfig,
  JobWithTicket,
  OutboundWebhookEventType,
  ResearchApprovalEvent,
} from "./feedback/types";

const logger = createChildLogger({ service: "FeedbackService" });

export class FeedbackService {
  constructor(
    private registry: ProviderRegistry,
    private configDAO: WebhookConfigDAO,
    private eventDispatcher: FeedbackEventDispatcher,
  ) {}

  async postJobResult(
    job: JobWithTicket,
    result: JobResult,
  ): Promise<FeedbackResult> {
    return this.postJobEnded(job, result);
  }

  async postJobStarted(job: JobWithTicket): Promise<FeedbackResult> {
    return this.eventDispatcher.dispatch(job, "job_started");
  }

  async postJobEnded(
    job: JobWithTicket,
    result: JobResult,
  ): Promise<FeedbackResult> {
    return this.eventDispatcher.dispatch(job, "job_ended", result);
  }

  async postResearchApproved(
    event: ResearchApprovalEvent,
  ): Promise<FeedbackResult> {
    try {
      const configs = await this.configDAO.listActiveConfigs(1, 0, "outbound");
      if (!configs[0]) {
        return {
          success: true,
          error: "No outbound webhook configuration found",
        };
      }

      const provider = this.registry.get(configs[0].provider);
      if (!provider) {
        return {
          success: false,
          error: `Provider '${configs[0].provider}' not registered`,
        };
      }

      // Get the external ticket ID from the ticket
      const ticketDAO = new TicketDAO();
      const ticket = await ticketDAO.getTicket(event.ticketId);
      if (!ticket) {
        return {
          success: false,
          error: "Ticket not found",
        };
      }

      const externalTicketId = ticket.externalTicketId;
      if (!externalTicketId) {
        return {
          success: true,
          error: "Ticket has no external ticket ID",
        };
      }

      const commentBody = `✅ **Research Approved**\n\nThe research phase has been approved. The ticket has been automatically advanced to the planning phase.`;

      await provider.postComment(externalTicketId, commentBody);

      return {
        success: true,
        commentPosted: true,
      };
    } catch (error) {
      logger.error("Failed to post research approval comment", {
        ticketId: event.ticketId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async retryPostResult(ticketId: string): Promise<FeedbackResult> {
    try {
      const configs = await this.configDAO.listActiveConfigs(1, 0, "outbound");
      if (!configs[0]) {
        return {
          success: false,
          error: "No outbound webhook configuration found",
        };
      }

      const provider = this.registry.get(configs[0].provider);
      if (!provider) {
        return {
          success: false,
          error: `Provider '${configs[0].provider}' not registered`,
        };
      }

      return { success: true };
    } catch (error) {
      logger.error("Failed to retry result for ticket", {
        ticketId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
