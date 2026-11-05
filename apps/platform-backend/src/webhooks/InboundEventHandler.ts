import type { InboundWebhookAction, InboundWebhookEvent, WebhookReceiver } from "@viberglass/integration-core";
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

type ConnectionConfigResolver = (
  config: WebhookConfig,
) => Promise<(AuthCredentials & Record<string, unknown>) | undefined>;

const NO_CONFIG: ConnectionConfigResolver = async () => undefined;

/**
 * Acts on what an integration reads out of an event: an issue or comment
 * reaches the tasks linked to it, and a task request creates one.
 */
export class InboundEventHandler {
  constructor(
    private readonly issues: Pick<TrackerIssueInbound, "issue" | "commented">,
    private readonly tasks: Pick<WebhookTaskCreator, "create">,
    private readonly connectionConfig: ConnectionConfigResolver = NO_CONFIG,
  ) {}

  async handle(context: InboundEventContext): Promise<EventProcessingResult> {
    const { event, config, receiver } = context;
    const readConfig = receiver.needsConnectionConfig
      ? await this.connectionConfig(config)
      : undefined;
    const settings = {
      botUsername: config.botUsername,
      ...(readConfig ? { config: readConfig } : {}),
    };
    const actions = receiver.readAll
      ? await receiver.readAll(event, settings)
      : [await receiver.read(event, settings)];

    let result: EventProcessingResult | undefined;
    for (const action of actions) {
      const next = await this.apply(action, context);
      if (!result || (result.ignoredReason && !next.ignoredReason)) result = next;
    }
    return result ?? { ignoredReason: "The event had nothing to act on" };
  }

  private async apply(action: InboundWebhookAction, context: InboundEventContext): Promise<EventProcessingResult> {
    switch (action.kind) {
      case "ignored":
        return { ignoredReason: action.reason };
      case "task":
        return this.tasks.create(action.task, context);
      case "issue": {
        const tracker = trackerContext(context.config);
        return tracker ? this.issues.issue(tracker, action.issue) : NO_CONNECTION;
      }
      case "comment": {
        const tracker = trackerContext(context.config);
        return tracker ? this.issues.commented(tracker, action.comment) : NO_CONNECTION;
      }
    }
  }
}

/** The connection a tracker webhook belongs to; null for a webhook that has lost its connection. */
function trackerContext(config: WebhookConfig): TrackerContext | null {
  return config.integrationId
    ? { provider: config.provider, integrationId: config.integrationId, webhookConfigId: config.id }
    : null;
}
