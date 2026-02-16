/**
 * Shortcut inbound event processor
 *
 * Handles Shortcut story_created and comment_created events,
 * creating tickets and optionally submitting jobs.
 */

import type {
  InboundEventProcessor,
  InboundEventContext,
  EventProcessingResult,
} from '../InboundEventProcessorResolver';
import type { ParsedWebhookEvent, ProviderType } from '../WebhookProvider';
import type { TicketDAO } from '../../persistence/ticketing/TicketDAO';
import type { ProjectIntegrationLinkDAO } from '../../persistence/integrations/ProjectIntegrationLinkDAO';
import type { JobService } from '../../services/JobService';
import type { CreateTicketRequest, Severity, TicketMetadata } from '@viberglass/types';
import type { JobData } from '../../types/Job';
import { randomUUID } from 'crypto';

interface WebhookJobContext {
  ticketId?: string;
  issueNumber?: number;
  issueUrl?: string;
  triggeredBy?: string;
  commentBody?: string;
  stepsToReproduce?: string;
}

interface ShortcutStoryPayload {
  data?: {
    id: number;
    name: string;
    description?: string;
    story_type: 'feature' | 'bug' | 'chore';
    workflow_state?: { name: string };
    project_id?: number;
    project?: { name: string };
    app_url: string;
  };
}

interface ShortcutCommentPayload {
  data?: {
    story_id: number;
    text: string;
    author_id: string;
  };
}

export class ShortcutInboundProcessor implements InboundEventProcessor {
  readonly provider: ProviderType | 'default' = 'shortcut';

  constructor(
    private ticketDAO: TicketDAO,
    private jobService: JobService,
    private projectIntegrationLinkDAO: ProjectIntegrationLinkDAO,
  ) {}

  canProcess(event: ParsedWebhookEvent): boolean {
    return event.provider === 'shortcut';
  }

  async process(context: InboundEventContext): Promise<EventProcessingResult> {
    const { event, config, tenantId, defaultTenantId } = context;
    const result: EventProcessingResult = {};

    const resolvedTenantId = await this.resolveProjectId(
      config.projectId,
      tenantId,
      defaultTenantId,
      config.integrationId,
    );
    result.projectId = resolvedTenantId;

    if (event.eventType !== 'story_created' && event.eventType !== 'comment_created') {
      result.ignoredReason = `Unsupported Shortcut event '${event.eventType}'`;
      return result;
    }

    if (event.eventType === 'story_created') {
      return this.processStoryCreated(event, config, resolvedTenantId, result);
    }

    if (event.eventType === 'comment_created') {
      return this.processCommentCreated(event, config, resolvedTenantId, result);
    }

    return result;
  }

  private async resolveProjectId(
    configProjectId: string | null,
    tenantId: string | undefined,
    defaultTenantId: string | undefined,
    integrationId: string | null,
  ): Promise<string> {
    if (configProjectId) {
      return configProjectId;
    }

    if (tenantId) {
      return tenantId;
    }

    if (integrationId) {
      const projectLinks =
        await this.projectIntegrationLinkDAO.getIntegrationProjects(integrationId);
      const linkedProjectId = projectLinks[0]?.projectId;
      if (linkedProjectId) {
        return linkedProjectId;
      }
    }

    if (defaultTenantId && defaultTenantId !== 'default') {
      return defaultTenantId;
    }

    throw new Error('No project linked to this webhook configuration');
  }

  private async processStoryCreated(
    event: ParsedWebhookEvent,
    config: InboundEventContext['config'],
    resolvedTenantId: string,
    result: EventProcessingResult,
  ): Promise<EventProcessingResult> {
    const payload = event.payload as ShortcutStoryPayload;

    if (!payload?.data) {
      return result;
    }

    const severity = this.mapStoryTypeToSeverity(payload.data.story_type);

    const ticketRequest: CreateTicketRequest = {
      projectId: resolvedTenantId,
      title: payload.data.name,
      description: payload.data.description || '',
      severity,
      category: payload.data.story_type === 'bug' ? 'bug' : 'feature',
      metadata: this.createTicketMetadata({
        ...this.createBaseMetadata(event, config),
        externalTicketId: payload.data.id.toString(),
        externalTicketUrl: payload.data.app_url,
        storyId: payload.data.id.toString(),
        shortcutStoryId: payload.data.id.toString(),
        issueNumber: payload.data.id,
        storyType: payload.data.story_type,
        projectId: payload.data.project_id?.toString() || event.metadata.projectId,
        project: payload.data.project?.name || event.metadata.repositoryId,
        repository: payload.data.project?.name || event.metadata.repositoryId,
        repositoryId: event.metadata.repositoryId || payload.data.project?.name,
        providerProjectId:
          payload.data.project_id?.toString() ||
          config.providerProjectId ||
          event.metadata.projectId,
        workflowState: payload.data.workflow_state?.name,
      }),
      annotations: [],
      autoFixRequested: config.autoExecute && payload.data.story_type === 'bug',
      ticketSystem: 'shortcut',
    };

    const ticket = await this.ticketDAO.createTicket(ticketRequest);
    result.ticketId = ticket.id;

    if (config.autoExecute && payload.data.story_type === 'bug') {
      result.jobId = await this.submitJob(
        ticket.id,
        resolvedTenantId,
        payload.data,
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
    const payload = event.payload as ShortcutCommentPayload;

    if (!config.botUsername || !payload?.data) {
      return result;
    }

    const commentBody = payload.data.text.toLowerCase();
    const mentionsBot =
      commentBody.includes(`@${config.botUsername.toLowerCase()}`) ||
      commentBody.includes(config.botUsername.toLowerCase());

    const hasTriggerKeyword =
      commentBody.includes('fix this') ||
      commentBody.includes('fix it') ||
      commentBody.includes('auto fix') ||
      commentBody.includes('autofix');

    if (!mentionsBot || !hasTriggerKeyword) {
      return result;
    }

    const ticketRequest: CreateTicketRequest = {
      projectId: resolvedTenantId,
      title: `Shortcut Comment on Story ${payload.data.story_id}`,
      description: payload.data.text,
      severity: 'medium',
      category: 'bug',
      metadata: this.createTicketMetadata({
        ...this.createBaseMetadata(event, config),
        externalTicketId: payload.data.story_id.toString(),
        storyId: payload.data.story_id.toString(),
        shortcutStoryId: payload.data.story_id.toString(),
        issueNumber: payload.data.story_id,
        projectId: event.metadata.projectId,
        repository: event.metadata.repositoryId,
        repositoryId: event.metadata.repositoryId,
        providerProjectId: config.providerProjectId || event.metadata.projectId,
        triggeredByComment: true,
      }),
      annotations: [],
      autoFixRequested: true,
      ticketSystem: 'shortcut',
    };

    const ticket = await this.ticketDAO.createTicket(ticketRequest);
    result.ticketId = ticket.id;

    const webhookContext: WebhookJobContext = {
      ticketId: ticket.id,
      issueNumber: payload.data.story_id,
      triggeredBy: 'bot-command',
      commentBody: payload.data.text.substring(0, 500),
      stepsToReproduce: `Triggered by Shortcut comment on story ${payload.data.story_id}`,
    };

    const jobData: JobData = {
      id: randomUUID(),
      tenantId: resolvedTenantId,
      repository: event.metadata.repositoryId || config.providerProjectId || '',
      task: `Fix Shortcut story from comment: ${payload.data.story_id}`,
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

  private mapStoryTypeToSeverity(storyType: string): Severity {
    switch (storyType) {
      case 'bug':
        return 'high';
      case 'feature':
        return 'medium';
      case 'chore':
        return 'low';
      default:
        return 'medium';
    }
  }

  private async submitJob(
    ticketId: string,
    resolvedTenantId: string,
    data: NonNullable<ShortcutStoryPayload['data']>,
  ): Promise<string> {
    const webhookContext: WebhookJobContext = {
      ticketId,
      issueNumber: data.id,
      issueUrl: data.app_url,
      stepsToReproduce: `Shortcut Story: ${data.app_url}`,
    };

    const jobData: JobData = {
      id: randomUUID(),
      tenantId: resolvedTenantId,
      repository: data.project?.name || '',
      task: `Fix Shortcut story: ${data.name}`,
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

  private createBaseMetadata(
    event: ParsedWebhookEvent,
    config: InboundEventContext['config'],
  ): Record<string, unknown> {
    return {
      webhookConfigId: config.id,
      provider: 'shortcut',
      eventType: event.eventType,
      eventAction: event.metadata.action,
      deliveryId: event.deduplicationId,
      integrationId: config.integrationId,
      providerProjectId: config.providerProjectId,
    };
  }
}
