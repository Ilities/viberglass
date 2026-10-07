import type { ParsedQs } from "qs";
import type { WebhookProvider } from "../../../persistence/webhook/WebhookConfigDAO";
import type { DeliveryStatus } from "../../../persistence/webhook/WebhookDeliveryDAO";
import { integrationRegistry } from "../../../integrations/registerIntegrationPlugins";

export function mapSystemToWebhookProvider(
  system: string,
): WebhookProvider | null {
  const provider = integrationRegistry.getWebhookProvider(system);
  return provider as WebhookProvider | null;
}

export function getDefaultInboundEvents(provider: WebhookProvider): string[] {
  return integrationRegistry.getDefaultInboundEvents(provider);
}

export function getProviderProjectIdFromIntegration(
  provider: WebhookProvider,
  integrationConfig: Record<string, unknown>,
): string | null {
  return integrationRegistry.getProviderProjectId(provider, integrationConfig);
}

export function serializeInboundWebhookConfig(
  config: {
    id: string;
    provider: WebhookProvider;
    allowedEvents: string[];
    planNewIssues: boolean;
    botUsername: string | null;
    active: boolean;
    webhookSecretEncrypted: string | null;
    providerProjectId: string | null;
    projectId: string | null;
    labelMappings?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
  },
  includeSecret?: string,
) {
  return {
    id: config.id,
    provider: config.provider,
    webhookUrl:
      config.provider === "custom" || config.provider === "shortcut"
        ? `/api/webhooks/${config.provider}/${config.id}`
        : `/api/webhooks/${config.provider}`,
    events: config.allowedEvents,
    planNewIssues: config.planNewIssues,
    botUsername: config.botUsername,
    active: config.active,
    hasSecret: Boolean(config.webhookSecretEncrypted),
    webhookSecret: includeSecret,
    providerProjectId: config.providerProjectId,
    projectId: config.projectId,
    labelMappings: config.labelMappings || {},
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

export function serializeWebhookDelivery(delivery: {
  id: string;
  provider: WebhookProvider;
  webhookConfigId: string | null;
  deliveryId: string;
  eventType: string;
  status: "pending" | "processing" | "succeeded" | "failed";
  errorMessage: string | null;
  ticketId: string | null;
  projectId: string | null;
  createdAt: Date;
  processedAt: Date | null;
}) {
  return {
    id: delivery.id,
    provider: delivery.provider,
    webhookConfigId: delivery.webhookConfigId,
    deliveryId: delivery.deliveryId,
    eventType: delivery.eventType,
    status: delivery.status,
    retryable: delivery.status === "failed",
    errorMessage: delivery.errorMessage,
    ticketId: delivery.ticketId,
    projectId: delivery.projectId,
    createdAt: delivery.createdAt,
    processedAt: delivery.processedAt,
  };
}

export function parseNonNegativeInt(value: unknown, fallback: number): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") {
    return fallback;
  }

  const parsed = Number.parseInt(candidate, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

const VALID_DELIVERY_STATUSES: DeliveryStatus[] = [
  "pending",
  "processing",
  "succeeded",
  "failed",
];

function splitQueryValues(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(",");
  }

  if (Array.isArray(value)) {
    return value.flatMap((nested) => splitQueryValues(nested));
  }

  return [];
}

export function parseDeliveryStatuses(
  query: ParsedQs | Record<string, unknown>,
): {
  statuses?: DeliveryStatus[];
  invalidValues: string[];
} {
  const rawValues = [query.statuses, query.status]
    .flatMap((value) => splitQueryValues(value))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (rawValues.length === 0) {
    return { invalidValues: [] };
  }

  const uniqueValues = Array.from(new Set(rawValues));
  const invalidValues = uniqueValues.filter(
    (value) => !VALID_DELIVERY_STATUSES.includes(value as DeliveryStatus),
  );
  if (invalidValues.length > 0) {
    return { invalidValues };
  }

  return {
    statuses: uniqueValues as DeliveryStatus[],
    invalidValues: [],
  };
}
