/**
 * GitHub inbound event processor
 *
 * Handles GitHub issues.opened and issue_comment.created events,
 * creating tickets and optionally submitting jobs.
 */

import type {
  InboundEventProcessor,
  InboundEventContext,
  EventProcessingResult,
} from "../InboundEventProcessorResolver";
import type { ParsedWebhookEvent, ProviderType } from "../WebhookProvider";
import type { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import type { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import type { JobService } from "../../services/JobService";
import type {
  CreateTicketRequest,
  Severity,
  TicketMetadata,
} from "@viberglass/types";
import { isObjectRecord } from "@viberglass/types";
import type { JobData } from "../../types/Job";
import { randomUUID } from "crypto";

interface WebhookJobContext {
  ticketId?: string;
  issueNumber?: number;
  issueUrl?: string;
  issueBody?: string;
  triggeredBy?: string;
  commentBody?: string;
  stepsToReproduce?: string;
}

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
    private jobService: JobService,
    private projectScmConfigDAO: ProjectScmConfigDAO,
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
      result.jobId = await this.submitJob(
        ticket.id,
        resolvedProjectId,
        payload,
      );
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

    const webhookContext: WebhookJobContext = {
      ticketId: ticket.id,
      issueNumber: payload.issue?.number,
      triggeredBy: "bot-command",
      commentBody: payload.comment?.body?.substring(0, 500),
      stepsToReproduce: `Triggered by bot comment: ${payload.comment?.body?.substring(0, 200)}`,
    };

    const jobData: JobData = {
      id: randomUUID(),
      tenantId: resolvedProjectId,
      repository: payload.repository?.full_name || "",
      task: `Fix issue: ${payload.issue?.title}`,
      context: webhookContext,
      settings: {
        runTests: true,
      },
      timestamp: Date.now(),
    };

    const jobResult = await this.jobService.submitJob(jobData, {
      ticketId: ticket.id,
    });
    result.jobId = jobResult.jobId;

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

  private async submitJob(
    ticketId: string,
    resolvedProjectId: string,
    payload: GitHubIssuePayload,
  ): Promise<string> {
    const webhookContext: WebhookJobContext = {
      ticketId,
      issueNumber: payload.issue!.number,
      issueUrl: payload.issue!.html_url,
      issueBody: payload.issue!.body,
      stepsToReproduce: `Issue URL: ${payload.issue!.html_url}\nIssue number: ${payload.issue!.number}`,
    };

    // Fetch project SCM config to use repository and branch settings
    const scmConfig =
      await this.projectScmConfigDAO.getByProjectId(resolvedProjectId);

    // Determine repository: use SCM config source repository if available, else fall back to payload
    const repository =
      scmConfig?.sourceRepository || payload.repository?.full_name || "";
    const baseBranch = scmConfig?.baseBranch || "main";

    const jobData: JobData = {
      id: randomUUID(),
      tenantId: resolvedProjectId,
      repository,
      task: `Fix issue: ${payload.issue!.title}`,
      baseBranch,
      context: webhookContext,
      settings: {
        runTests: true,
      },
      scm: scmConfig
        ? {
            integrationId: scmConfig.integrationId,
            integrationSystem: scmConfig.integrationSystem,
            sourceRepository: scmConfig.sourceRepository,
            baseBranch: scmConfig.baseBranch,
            pullRequestRepository:
              scmConfig.pullRequestRepository || scmConfig.sourceRepository,
            pullRequestBaseBranch:
              scmConfig.pullRequestBaseBranch || scmConfig.baseBranch,
            branchNameTemplate: scmConfig.branchNameTemplate,
          }
        : undefined,
      timestamp: Date.now(),
    };

    const jobResult = await this.jobService.submitJob(jobData, {
      ticketId,
    });
    return jobResult.jobId;
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
