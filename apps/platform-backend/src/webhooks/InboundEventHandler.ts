import type { InboundWebhookEvent, WebhookReadSettings, WebhookReceiver } from "@viberglass/integration-core";
import type { AuthCredentials } from "@viberglass/types";
import type { WebhookConfig } from "../persistence/webhook/WebhookConfigDAO";
import type { TrackerContext, TrackerIssueInbound } from "../services/trackers/TrackerIssueInbound";
import type { WebhookTaskCreator } from "./WebhookTaskCreator";

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
    /** Resolves the connection's credentials, for a read that fetches details from the tracker's API. */
    private readonly connectionCredentials?: (integrationId: string) => Promise<AuthCredentials | null>,
  ) {}

  async handle(context: InboundEventContext): Promise<EventProcessingResult> {
    const { event, config, receiver } = context;
    const settings = await this.readSettings(config);
    const action = receiver.readAsync
      ? await receiver.readAsync(event, settings)
      : receiver.read(event, settings);
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

  private async readSettings(config: WebhookConfig): Promise<WebhookReadSettings> {
    const settings: WebhookReadSettings = { botUsername: config.botUsername };
    if (config.integrationId && this.connectionCredentials) {
      const credentials = await this.connectionCredentials(config.integrationId);
      if (credentials) settings.credentials = credentials;
    }
    return settings;
  }
}

/** The connection a tracker webhook belongs to; null for a webhook that has lost its connection. */
function trackerContext(config: WebhookConfig): TrackerContext | null {
  return config.integrationId
    ? { provider: config.provider, integrationId: config.integrationId, webhookConfigId: config.id }
    : null;
}
