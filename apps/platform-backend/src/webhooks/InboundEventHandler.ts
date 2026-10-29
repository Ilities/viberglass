import type { InboundWebhookAction, InboundWebhookEvent, WebhookReceiver } from "@viberglass/integration-core";
import type { WebhookConfig } from "../persistence/webhook/WebhookConfigDAO";
import type { TrackerContext, TrackerIssueInbound } from "../services/trackers/TrackerIssueInbound";
import type { WebhookTaskCreator } from "./WebhookTaskCreator";
import type { AuthCredentials } from "@viberglass/types";
import { IntegrationDAO } from "../persistence/integrations/IntegrationDAO";
import { ConnectionCredentialsResolver } from "../services/trackers/ConnectionCredentialsResolver";

export interface InboundEventContext {
  event: InboundWebhookEvent;
  config: WebhookConfig;
  /** The integration that reads the webhook's events. */
  receiver: WebhookReceiver;
  /** Tenant from the request context, if any. */
  tenantId?: string;
  defaultTenantId?: string;
}

export interface EventProcessingResult {
  ticketId?: string;
  jobId?: string;
  projectId?: string;
  /** Set when the event was read but nothing was done with it. */
  ignoredReason?: string;
}

const NO_CONNECTION: EventProcessingResult = { ignoredReason: "The webhook isn't part of a connection" };

/**
 * Acts on what an integration reads out of an event: an issue or comment
 * reaches the tasks linked to it, and a task request creates one.
 */
export class InboundEventHandler {
  constructor(
    private readonly issues: Pick<TrackerIssueInbound, "issue" | "commented">,
    private readonly tasks: Pick<WebhookTaskCreator, "create">,
    private readonly integrations: Pick<IntegrationDAO, "getIntegration"> | null = null,
    private readonly credentials = new ConnectionCredentialsResolver(),
  ) {}

  async handle(context: InboundEventContext): Promise<EventProcessingResult> {
    const { event, config, receiver } = context;
    const actions = await receiver.read(event, {
      botUsername: config.botUsername,
      credentials: config.integrationId ? await this.integrationCredentials(config.integrationId) : undefined,
    });
    const batchActions = Array.isArray(actions) ? actions : [actions];
    let result: EventProcessingResult = { ignoredReason: "No supported event in webhook batch" };
    for (const action of batchActions) {
      result = await this.handleAction(action, context);
      if (!result.ignoredReason) {
        if (!Array.isArray(actions)) return result;
      }
    }
    return result;
  }

  private async handleAction(action: InboundWebhookAction, context: InboundEventContext): Promise<EventProcessingResult> {
    const { config } = context;
    switch (action.kind) {
      case "ignored":
        return { ignoredReason: action.reason };
      case "task":
        return this.tasks.create(action.task, context);
      case "issue": {
        const tracker = trackerContext(config);
        return tracker ? this.issues.issue(tracker, action.issue) : NO_CONNECTION;
      }
      case "comment": {
        const tracker = trackerContext(config);
        return tracker ? this.issues.commented(tracker, action.comment) : NO_CONNECTION;
      }
    }
  }

  private async integrationCredentials(integrationId: string): Promise<AuthCredentials | undefined> {
    if (!this.integrations) return undefined;
    const integration = await this.integrations.getIntegration(integrationId);
    return integration ? this.credentials.resolve(integration) : undefined;
  }
}

/** The connection a tracker webhook belongs to; null for a webhook that has lost its connection. */
function trackerContext(config: WebhookConfig): TrackerContext | null {
  return config.integrationId
    ? { provider: config.provider, integrationId: config.integrationId, webhookConfigId: config.id }
    : null;
}
