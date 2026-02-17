import type { ProjectIntegrationLinkDAO } from "../../../persistence/integrations";
import type { WebhookConfigDAO } from "../../../persistence/webhook/WebhookConfigDAO";
import type {
  JsonObject,
  JsonValue,
} from "../../../persistence/types/database";
import type { IntegrationWebhookProviderPolicy } from "./IntegrationWebhookProviderPolicy";
import { IntegrationRouteServiceError } from "./errors";
import { getProviderProjectIdFromIntegration } from "./shared";

function toJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const parsedItems: JsonValue[] = [];
    for (const item of value) {
      const parsedItem = toJsonValue(item);
      if (parsedItem === undefined) {
        return undefined;
      }
      parsedItems.push(parsedItem);
    }

    return parsedItems;
  }

  if (typeof value !== "object") {
    return undefined;
  }

  const parsedObject: JsonObject = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const parsedNested = toJsonValue(nestedValue);
    if (parsedNested !== undefined) {
      parsedObject[key] = parsedNested;
    }
  }

  return parsedObject;
}

export function toJsonObject(value: unknown): JsonObject | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object") return undefined;
  if (Array.isArray(value)) return undefined;

  const parsed = toJsonValue(value);
  if (
    parsed === undefined ||
    parsed === null ||
    Array.isArray(parsed) ||
    typeof parsed !== "object"
  ) {
    return undefined;
  }

  return parsed;
}

export function normalizeOptionalId(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveProviderProjectId(
  provider: "github" | "jira" | "shortcut" | "custom",
  providerPolicy: IntegrationWebhookProviderPolicy,
  inputProviderProjectId: string | null | undefined,
  integrationConfig: { [key: string]: unknown },
): string | null {
  const explicitProviderProjectId = normalizeOptionalId(inputProviderProjectId);
  if (explicitProviderProjectId) {
    return explicitProviderProjectId;
  }

  if (!providerPolicy.shouldUseIntegrationProviderProjectIdFallback()) {
    return null;
  }

  return getProviderProjectIdFromIntegration(provider, integrationConfig) || null;
}

export async function resolveProjectId(
  projectLinkDAO: ProjectIntegrationLinkDAO,
  integrationId: string,
  explicitProjectId: string | null | undefined,
): Promise<string | null> {
  if (explicitProjectId !== undefined) {
    return normalizeOptionalId(explicitProjectId);
  }

  const projectLinks = await projectLinkDAO.getIntegrationProjects(integrationId);
  return projectLinks[0]?.projectId || null;
}

export async function ensureProjectLink(
  projectLinkDAO: ProjectIntegrationLinkDAO,
  projectId: string | null,
  integrationId: string,
): Promise<void> {
  if (!projectId) {
    return;
  }

  const isLinked = await projectLinkDAO.isLinked(projectId, integrationId);
  if (isLinked) {
    return;
  }

  await projectLinkDAO.linkIntegration({
    projectId,
    integrationId,
    isPrimary: false,
  });
}

export async function getInboundConfigForIntegrationOrThrow(
  webhookConfigDAO: WebhookConfigDAO,
  integrationId: string,
  configId: string,
) {
  const config = await webhookConfigDAO.getByIntegrationAndConfigId(
    integrationId,
    configId,
    {
      direction: "inbound",
    },
  );
  if (!config) {
    throw new IntegrationRouteServiceError(
      404,
      "Inbound webhook configuration not found",
    );
  }

  return config;
}

export async function getOutboundConfigForIntegrationOrThrow(
  webhookConfigDAO: WebhookConfigDAO,
  integrationId: string,
  configId: string,
) {
  const config = await webhookConfigDAO.getByIntegrationAndConfigId(
    integrationId,
    configId,
    {
      direction: "outbound",
    },
  );
  if (!config) {
    throw new IntegrationRouteServiceError(
      404,
      "Outbound webhook configuration not found",
    );
  }

  return config;
}
