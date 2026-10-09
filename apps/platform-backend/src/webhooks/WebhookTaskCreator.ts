import type { Annotation, InboundTask, TicketMetadata } from "@viberglass/types";
import type { TicketDAO } from "../persistence/ticketing/TicketDAO";
import type { WebhookConfig } from "../persistence/webhook/WebhookConfigDAO";
import type { WebhookPlanRequester } from "./WebhookPlanRequester";
import type { EventProcessingResult } from "./InboundEventHandler";

/** Creates the task a webhook asks for in its space, and asks for its plan when the webhook is set to. */
export class WebhookTaskCreator {
  constructor(
    private readonly tickets: Pick<TicketDAO, "createTicket" | "updateTicket">,
    private readonly planner: Pick<WebhookPlanRequester, "request">,
  ) {}

  async create(
    task: InboundTask,
    context: { config: WebhookConfig; tenantId?: string; defaultTenantId?: string },
  ): Promise<EventProcessingResult> {
    const { config } = context;
    if (!context.tenantId && !config.projectId) {
      throw new Error("No project linked to this webhook configuration");
    }
    const projectId = context.tenantId || config.projectId || context.defaultTenantId || "default";

    // Where the task came from is kept with the metadata the task already records.
    const source: Record<string, unknown> = {
      externalTicketId: task.externalId,
      externalTicketUrl: task.url,
      webhookConfigId: config.id,
      provider: config.provider,
    };
    const metadata: TicketMetadata = {
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...source,
    };
    const annotations: Annotation[] = [];
    const ticket = await this.tickets.createTicket({
      projectId,
      title: task.title,
      description: task.description,
      severity: task.severity,
      category: task.category,
      metadata,
      annotations,
      ticketSystem: config.provider,
      autoFixRequested: false,
    });

    if (task.externalId || task.url) {
      await this.tickets.updateTicket(ticket.id, {
        externalTicketId: task.externalId || undefined,
        externalTicketUrl: task.url || undefined,
      });
    }

    const jobId = config.planNewIssues ? await this.planner.request(ticket.id) : undefined;
    return { ticketId: ticket.id, projectId, jobId };
  }
}
