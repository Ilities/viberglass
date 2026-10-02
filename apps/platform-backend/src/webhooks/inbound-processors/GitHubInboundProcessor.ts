/**
 * GitHub inbound event processor
 *
 * Handles GitHub issues.opened and issue_comment.created events,
 * creating tickets and optionally asking their agent to build.
 */

import type {
  InboundEventProcessor,
  InboundEventContext,
  EventProcessingResult,
} from "../InboundEventProcessorResolver";
import type { ParsedWebhookEvent, ProviderType } from "../WebhookProvider";
import type { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import type { WebhookBuildRequester } from "../WebhookBuildRequester";
import type {
  CreateTicketRequest,
  Severity,
  TicketMetadata,
} from "@viberglass/types";
import { isObjectRecord } from "@viberglass/types";

interface GitHubIssuePayload {
  action?: string;
  issue?: {
    number: number;
    title: string;
    body?: string;
    html_url: string;
    user: { login: string };
    state: string;
    labels?: Array<{ name: string }>;
  };
  repository?: {
    full_name: string;
    owner: { login: string };
    name: string;
  };
  installation?: {
    id: number;
  };
  sender?: {
    login: string;
  };
}

interface GitHubCommentPayload {
  action?: string;
  issue?: {
    number: number;
    title: string;
    body?: string;
    html_url?: string;
  };
  comment?: {
    id: number;
    body?: string;
    user: { login: string };
    created_at: string;
    updated_at: string;
  };
  repository?: {
    full_name: string;
  };
  sender?: {
    login: string;
  };
}

interface GitHubAutoExecutePolicy {
  mode: "matching_events" | "label_gated";
  requiredLabels: string[];
}

export class GitHubInboundProcessor implements InboundEventProcessor {
  readonly provider: ProviderType | "default" = "github";

  constructor(
    private ticketDAO: TicketDAO,
    private builds: Pick<WebhookBuildRequester, "request">,
  ) {}

  canProcess(event: ParsedWebhookEvent): boolean {
    return event.provider === "github";
  }

  async process(context: InboundEventContext): Promise<EventProcessingResult> {
    const { event, config, tenantId, defaultTenantId } = context;
    const result: EventProcessingResult = {};

    const resolvedProjectId =
      config.projectId || tenantId || defaultTenantId || "default";
    result.projectId = resolvedProjectId;

    const baseEventType = event.eventType.split(".")[0];

    if (baseEventType === "issues") {
      return this.processIssueEvent(event, config, resolvedProjectId, result);
    }

    if (baseEventType === "issue_comment") {
      return this.processCommentEvent(event, config, resolvedProjectId, result);
    }

    return result;
  }

  private async processIssueEvent(
    event: ParsedWebhookEvent,
    config: InboundEventContext["config"],
    resolvedProjectId: string,
    result: EventProcessingResult,
  ): Promise<EventProcessingResult> {
    const payload = event.payload as GitHubIssuePayload;
    const action = payload?.action || event.metadata.action;

    if (action !== "opened" || !payload?.issue) {
      return result;
    }

    const severity = this.detectSeverityFromLabels(payload.issue.labels);
    const autoExecuteIssueFix = this.shouldAutoExecuteIssue(
      config.autoExecute,
      config.labelMappings,
      payload.issue.labels,
    );

    const ticketRequest: CreateTicketRequest = {
      projectId: resolvedProjectId,
      title: payload.issue.title,
      description: payload.issue.body || "",
      severity,
      category: "bug",
      metadata: this.createTicketMetadata({
        externalTicketId: String(payload.issue.number),
        externalTicketUrl: payload.issue.html_url,
        webhookConfigId: config.id,
        provider: "github",
        repository: payload.repository?.full_name,
        sender: payload.sender?.login,
        issueState: payload.issue.state,
        eventType: event.eventType,
        eventAction: action,
        deliveryId: event.deduplicationId,
        integrationId: config.integrationId,
        providerProjectId: config.providerProjectId,
        installationId: payload.installation?.id?.toString(),
      }),
      annotations: [],
      autoFixRequested: autoExecuteIssueFix,
      ticketSystem: "github",
    };

    const ticket = await this.ticketDAO.createTicket(ticketRequest);
    result.ticketId = ticket.id;

    if (autoExecuteIssueFix) {
      result.jobId = await this.builds.request(ticket.id);
    }

    return result;
  }

  private async processCommentEvent(
    event: ParsedWebhookEvent,
    config: InboundEventContext["config"],
    resolvedProjectId: string,
    result: EventProcessingResult,
  ): Promise<EventProcessingResult> {
    const payload = event.payload as GitHubCommentPayload;
    const action = payload?.action || event.metadata.action;

    if (action !== "created") {
      return result;
    }

    if (!config.botUsername || !payload?.comment) {
      return result;
    }

    const normalizedBotUsername = config.botUsername.toLowerCase();
    const commentAuthor =
      payload.comment.user?.login?.toLowerCase() ||
      payload.sender?.login?.toLowerCase() ||
      "";

    if (commentAuthor === normalizedBotUsername) {
      return result;
    }

    const commentBody = payload.comment.body?.toLowerCase() || "";
    const mentionsBot =
      commentBody.includes(`@${normalizedBotUsername}`) ||
      commentBody.includes(normalizedBotUsername);

    const hasTriggerKeyword =
      commentBody.includes("fix this") ||
      commentBody.includes("fix it") ||
      commentBody.includes("auto fix") ||
      commentBody.includes("autofix");

    if (!mentionsBot || !hasTriggerKeyword) {
      return result;
    }

    const ticketRequest: CreateTicketRequest = {
      projectId: resolvedProjectId,
      title: payload.issue?.title || `Issue ${payload.issue?.number}`,
      description: payload.comment?.body || "",
      severity: "medium",
      category: "bug",
      metadata: this.createTicketMetadata({
        externalTicketId: String(payload.issue?.number),
        externalTicketUrl: payload.issue?.html_url,
        webhookConfigId: config.id,
        provider: "github",
        repository: payload.repository?.full_name,
        commentId: payload.comment.id.toString(),
        triggeredByComment: true,
        sender: payload.sender?.login,
        eventType: event.eventType,
        eventAction: action,
        deliveryId: event.deduplicationId,
        integrationId: config.integrationId,
        providerProjectId: config.providerProjectId,
      }),
      annotations: [],
      autoFixRequested: true,
      ticketSystem: "github",
    };

    const ticket = await this.ticketDAO.createTicket(ticketRequest);
    result.ticketId = ticket.id;

    result.jobId = await this.builds.request(ticket.id);

    return result;
  }

  private detectSeverityFromLabels(
    labels: Array<{ name: string }> | undefined,
  ): Severity {
    if (!labels) {
      return "low";
    }

    const labelNames = labels.map((l) => l.name.toLowerCase());
    if (
      labelNames.some((l) => l.includes("critical") || l.includes("urgent"))
    ) {
      return "critical";
    }
    if (labelNames.some((l) => l.includes("high") || l.includes("important"))) {
      return "high";
    }
    if (labelNames.some((l) => l.includes("medium"))) {
      return "medium";
    }
    return "low";
  }

  private shouldAutoExecuteIssue(
    autoExecute: boolean,
    labelMappings: Record<string, unknown>,
    issueLabels: Array<{ name: string }> | undefined,
  ): boolean {
    if (!autoExecute) {
      return false;
    }

    const policy = this.resolveAutoExecutePolicy(labelMappings);
    if (policy.mode !== "label_gated") {
      return true;
    }

    const issueLabelNames = new Set(
      (issueLabels || [])
        .map((label) => label.name?.trim().toLowerCase())
        .filter((label): label is string => Boolean(label)),
    );

    if (issueLabelNames.size === 0 || policy.requiredLabels.length === 0) {
      return false;
    }

    return policy.requiredLabels.some((label) => issueLabelNames.has(label));
  }

  private resolveAutoExecutePolicy(
    labelMappings: Record<string, unknown>,
  ): GitHubAutoExecutePolicy {
    const root = isObjectRecord(labelMappings) ? labelMappings : undefined;
    const nested = isObjectRecord(root?.github) ? root.github : undefined;
    const source = nested || root;

    const rawMode = source?.autoExecuteMode ?? source?.mode;
    const normalizedMode =
      typeof rawMode === "string"
        ? rawMode.trim().toLowerCase()
        : "matching_events";
    const mode: GitHubAutoExecutePolicy["mode"] =
      normalizedMode === "label_gated" ? "label_gated" : "matching_events";

    if (mode !== "label_gated") {
      return {
        mode: "matching_events",
        requiredLabels: [],
      };
    }

    const rawLabels = source?.requiredLabels ?? source?.labels;
    const requiredLabels = Array.isArray(rawLabels)
      ? rawLabels
          .map((label) =>
            typeof label === "string" ? label.trim().toLowerCase() : "",
          )
          .filter((label): label is string => Boolean(label))
      : [];

    return {
      mode,
      requiredLabels: Array.from(new Set(requiredLabels)),
    };
  }

  private createTicketMetadata(
    baseData: Record<string, unknown>,
  ): TicketMetadata {
    return {
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...baseData,
    };
  }
}
