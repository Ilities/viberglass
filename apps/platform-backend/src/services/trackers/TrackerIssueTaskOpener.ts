import type { TicketMetadata } from "@viberglass/types";
import type { TaskIssueLinkDAO } from "../../persistence/ticketing/TaskIssueLinkDAO";
import type { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import type { UserDAO } from "../../persistence/user/UserDAO";
import type { WebhookPlanRequester } from "../../webhooks/WebhookPlanRequester";
import type { InboundIssue } from "@viberglass/types";
import type { TrackerContext, TrackerEventResult } from "./TrackerIssueInbound";
import type { RoutedSpace } from "./TrackerIssueRouter";
import { trackerPersonId } from "./trackerPersonId";

interface Dependencies {
  tickets: Pick<TicketDAO, "createTicket" | "updateTicket">;
  links: Pick<TaskIssueLinkDAO, "create">;
  users: Pick<UserDAO, "findByEmail">;
  planner: Pick<WebhookPlanRequester, "request">;
}

/** Creates a space's task for a tracker issue, links it to the issue, and has the plan written when the space asks for it. */
export class TrackerIssueTaskOpener {
  constructor(private readonly deps: Dependencies) {}

  async open(context: TrackerContext, issue: InboundIssue & { title: string }, space: RoutedSpace): Promise<TrackerEventResult> {
    const requesterId = issue.author ? await trackerPersonId(this.deps.users, issue.author) : null;
    const tracker: Record<string, unknown> = { ...issue.metadata, provider: context.provider, externalTicketId: issue.key, externalTicketUrl: issue.url };
    const metadata: TicketMetadata = { timestamp: new Date().toISOString(), timezone: "UTC", ...tracker };
    const ticket = await this.deps.tickets.createTicket({
      projectId: space.projectId,
      title: issue.title,
      description: issue.description ?? "",
      severity: issue.severity,
      category: context.provider,
      metadata,
      annotations: [],
      autoFixRequested: false,
      ticketSystem: context.provider,
      requesterId: requesterId ?? undefined,
    });
    await this.deps.tickets.updateTicket(ticket.id, { externalTicketId: issue.key, externalTicketUrl: issue.url ?? undefined });
    await this.deps.links.create({
      ticketId: ticket.id,
      provider: context.provider,
      issueKey: issue.key,
      issueUrl: issue.url,
      integrationId: context.integrationId,
      webhookConfigId: context.webhookConfigId,
      apiBaseUrl: issue.apiBaseUrl,
    });
    const result = { ticketId: ticket.id, projectId: space.projectId };
    return space.plan ? { ...result, jobId: await this.deps.planner.request(ticket.id) } : result;
  }
}
