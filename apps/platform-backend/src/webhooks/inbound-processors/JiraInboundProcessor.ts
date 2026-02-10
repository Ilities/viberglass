/**
 * Jira inbound event processor
 *
 * Handles Jira issue_created and comment_created events,
 * creating tickets and optionally submitting jobs.
 */

import type {
  InboundEventProcessor,
  InboundEventContext,
  EventProcessingResult,
} from '../InboundEventProcessorResolver';
import type { ParsedWebhookEvent, ProviderType } from '../WebhookProvider';
import type { TicketDAO } from '../../persistence/ticketing/TicketDAO';
import type { JobService } from '../../services/JobService';
import type { CreateTicketRequest, Severity, TicketMetadata } from '@viberglass/types';
import type { JobData } from '../../types/Job';
import { randomUUID } from 'crypto';

interface WebhookJobContext {
  ticketId?: string;
  issueKey?: string;
  triggeredBy?: string;
  commentBody?: string;
  stepsToReproduce?: string;
}

interface JiraIssuePayload {
  issue?: {
    key: string;
    self?: string;
    fields: {
      summary: string;
      description?: unknown;
      priority?: { name: string };
      issuetype: { name: string };
    };
  };
  user?: {
    displayName: string;
  };
}

interface JiraCommentPayload {
  issue?: {
    key: string;
    self?: string;
    fields: {
      summary: string;
    };
  };
  comment?: {
    id?: string;
    body?: unknown;
    author: {
      displayName: string;
    };
  };
}

export class JiraInboundProcessor implements InboundEventProcessor {
  readonly provider: ProviderType | 'default' = 'jira';

  constructor(
    private ticketDAO: TicketDAO,
    private jobService: JobService,
  ) {}

  canProcess(event: ParsedWebhookEvent): boolean {
    return event.provider === 'jira';
  }

  async process(context: InboundEventContext): Promise<EventProcessingResult> {
    const { event, config, tenantId, defaultTenantId } = context;
    const result: EventProcessingResult = {};

    const resolvedTenantId =
      config.projectId || tenantId || defaultTenantId || 'default';
    result.projectId = resolvedTenantId;

    if (event.eventType !== 'issue_created' && event.eventType !== 'comment_created') {
      const scopedEventType = event.metadata.action
        ? `${event.eventType}.${event.metadata.action}`
        : event.eventType;
      result.ignoredReason = `Unsupported Jira event action '${scopedEventType}'`;
      return result;
    }

    if (event.eventType === 'issue_created') {
      return this.processIssueCreated(event, config, resolvedTenantId, result);
    }

    if (event.eventType === 'comment_created') {
      return this.processCommentCreated(event, config, resolvedTenantId, result);
    }

    return result;
  }

  private async processIssueCreated(
    event: ParsedWebhookEvent,
    config: InboundEventContext['config'],
    resolvedTenantId: string,
    result: EventProcessingResult,
  ): Promise<EventProcessingResult> {
    const payload = event.payload as JiraIssuePayload;

    if (!payload?.issue?.fields?.summary) {
      return result;
    }

    const severity = this.detectSeverityFromPriority(payload.issue.fields.priority?.name);
    const description = this.extractJiraTextContent(payload.issue.fields.description);

    const ticketRequest: CreateTicketRequest = {
      projectId: resolvedTenantId,
      title: payload.issue.fields.summary,
      description,
      severity,
      category: 'bug',
      metadata: this.createTicketMetadata({
        externalTicketId: payload.issue.key,
        webhookConfigId: config.id,
        provider: 'jira',
        sender: payload.user?.displayName || event.metadata.sender,
        issueType: payload.issue.fields.issuetype.name,
        eventType: event.eventType,
        eventAction: event.metadata.action,
        deliveryId: event.deduplicationId,
        integrationId: config.integrationId,
        providerProjectId: config.providerProjectId,
        jiraIssueKey: payload.issue.key,
        jiraIssueApiUrl: payload.issue.self,
        jiraApiBaseUrl: this.extractJiraApiBaseUrl(payload.issue.self),
        externalTicketUrl: this.buildJiraIssueBrowseUrl(payload.issue.self, payload.issue.key),
        jiraProjectKey:
          event.metadata.repositoryId || this.extractJiraProjectKey(payload.issue.key),
      }),
      annotations: [],
      autoFixRequested: config.autoExecute,
      ticketSystem: 'jira',
    };

    const ticket = await this.ticketDAO.createTicket(ticketRequest);
    result.ticketId = ticket.id;

    if (config.autoExecute) {
      result.jobId = await this.submitJob(
        ticket.id,
        resolvedTenantId,
        payload,
        event,
      );
    }

    return result;
  }

  private async processCommentCreated(
    event: ParsedWebhookEvent,
    config: InboundEventContext['config'],
    resolvedTenantId: string,
    result: EventProcessingResult,
  ): Promise<EventProcessingResult> {
    const payload = event.payload as JiraCommentPayload;

    const commentBody = this.extractJiraTextContent(payload?.comment?.body);
    if (!config.botUsername || !payload?.comment || !commentBody) {
      return result;
    }

    const normalizedBody = commentBody.toLowerCase();
    const normalizedBotUsername = config.botUsername.toLowerCase();
    const mentionsBot =
      normalizedBody.includes(`@${normalizedBotUsername}`) ||
      normalizedBody.includes(normalizedBotUsername);

    const hasTriggerKeyword =
      normalizedBody.includes('fix this') ||
      normalizedBody.includes('fix it') ||
      normalizedBody.includes('auto fix') ||
      normalizedBody.includes('autofix');

    if (!mentionsBot || !hasTriggerKeyword) {
      return result;
    }

    const ticketRequest: CreateTicketRequest = {
      projectId: resolvedTenantId,
      title: payload.issue?.fields.summary || `Jira Issue ${payload.issue?.key}`,
      description: commentBody,
      severity: 'medium',
      category: 'bug',
      metadata: this.createTicketMetadata({
        externalTicketId: payload.issue?.key,
        webhookConfigId: config.id,
        provider: 'jira',
        triggeredByComment: true,
        sender: payload.comment.author.displayName,
        commentId: payload.comment.id,
        eventType: event.eventType,
        eventAction: event.metadata.action,
        deliveryId: event.deduplicationId,
        integrationId: config.integrationId,
        providerProjectId: config.providerProjectId,
        jiraIssueKey: payload.issue?.key,
        jiraIssueApiUrl: payload.issue?.self,
        jiraApiBaseUrl: this.extractJiraApiBaseUrl(payload.issue?.self),
        externalTicketUrl: this.buildJiraIssueBrowseUrl(payload.issue?.self, payload.issue?.key),
        jiraProjectKey:
          event.metadata.repositoryId || this.extractJiraProjectKey(payload.issue?.key),
      }),
      annotations: [],
      autoFixRequested: true,
      ticketSystem: 'jira',
    };

    const ticket = await this.ticketDAO.createTicket(ticketRequest);
    result.ticketId = ticket.id;

    const webhookContext: WebhookJobContext = {
      ticketId: ticket.id,
      issueKey: payload.issue?.key,
      triggeredBy: 'bot-command',
      commentBody: commentBody.substring(0, 500),
      stepsToReproduce: `Triggered by Jira comment on ${payload.issue?.key}`,
    };

    const jobData: JobData = {
      id: randomUUID(),
      tenantId: resolvedTenantId,
      repository:
        event.metadata.repositoryId ||
        this.extractJiraProjectKey(payload.issue?.key) ||
        '',
      task: `Fix Jira issue: ${payload.issue?.fields.summary}`,
      context: webhookContext as any,
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

  private detectSeverityFromPriority(priorityName: string | undefined): Severity {
    const normalized = priorityName?.toLowerCase() || '';
    if (normalized.includes('highest') || normalized.includes('critical')) {
      return 'critical';
    }
    if (normalized.includes('high')) {
      return 'high';
    }
    if (normalized.includes('low')) {
      return 'low';
    }
    return 'medium';
  }

  private async submitJob(
    ticketId: string,
    resolvedTenantId: string,
    payload: JiraIssuePayload,
    event: ParsedWebhookEvent,
  ): Promise<string> {
    const webhookContext: WebhookJobContext = {
      ticketId,
      issueKey: payload.issue!.key,
      stepsToReproduce: `Jira Issue: ${payload.issue!.key}`,
    };

    const jobData: JobData = {
      id: randomUUID(),
      tenantId: resolvedTenantId,
      repository:
        event.metadata.repositoryId ||
        this.extractJiraProjectKey(payload.issue!.key) ||
        '',
      task: `Fix Jira issue: ${payload.issue!.fields.summary}`,
      context: webhookContext as any,
      settings: {
        runTests: true,
      },
      timestamp: Date.now(),
    };

    const jobResult = await this.jobService.submitJob(jobData, {
      ticketId,
    });
    return jobResult.jobId;
  }

  private createTicketMetadata(baseData: Record<string, unknown>): TicketMetadata {
    return {
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...baseData,
    };
  }

  // Jira text extraction utilities

  extractJiraProjectKey(issueKey?: string): string | undefined {
    if (!issueKey) {
      return undefined;
    }

    const separatorIndex = issueKey.indexOf('-');
    if (separatorIndex <= 0) {
      return undefined;
    }

    return issueKey.slice(0, separatorIndex);
  }

  extractJiraApiBaseUrl(issueSelf?: string): string | undefined {
    if (!issueSelf) {
      return undefined;
    }

    try {
      const parsed = new URL(issueSelf);
      const path = parsed.pathname.replace(/\/+$/, '');
      const restMatch = path.match(/^(.*)\/rest\/api\/([^/]+)(?:\/.*)?$/i);
      if (!restMatch) {
        return undefined;
      }

      const contextPath = (restMatch[1] || '').replace(/\/+$/, '');
      const apiVersion = restMatch[2];
      return `${parsed.origin}${contextPath}/rest/api/${apiVersion}`;
    } catch {
      return undefined;
    }
  }

  buildJiraIssueBrowseUrl(issueSelf?: string, issueKey?: string): string | undefined {
    if (!issueSelf || !issueKey) {
      return undefined;
    }

    try {
      const parsed = new URL(issueSelf);
      const path = parsed.pathname.replace(/\/+$/, '');
      const restMatch = path.match(/^(.*)\/rest\/api\/[^/]+(?:\/.*)?$/i);
      if (!restMatch) {
        return undefined;
      }

      const contextPath = (restMatch[1] || '').replace(/\/+$/, '');
      return `${parsed.origin}${contextPath}/browse/${issueKey}`;
    } catch {
      return undefined;
    }
  }

  extractJiraTextContent(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value !== 'object') {
      return String(value);
    }

    const parts: string[] = [];
    this.collectJiraTextNodes(value, parts);
    const flattened = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (flattened.length > 0) {
      return flattened;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  private collectJiraTextNodes(value: unknown, parts: string[]): void {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        parts.push(trimmed);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectJiraTextNodes(item, parts);
      }
      return;
    }

    if (typeof value !== 'object' || value === null) {
      return;
    }

    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') {
      this.collectJiraTextNodes(record.text, parts);
    }

    if (Array.isArray(record.content)) {
      this.collectJiraTextNodes(record.content, parts);
    }
  }
}
