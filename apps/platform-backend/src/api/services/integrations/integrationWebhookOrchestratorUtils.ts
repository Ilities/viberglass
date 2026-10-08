import type { ProjectIntegrationLinkDAO } from "../../../persistence/integrations";
import type { WebhookConfigDAO } from "../../../persistence/webhook/WebhookConfigDAO";
import { IntegrationRouteServiceError } from "./errors";

export function normalizeOptionalId(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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
  );
  if (!config) {
    throw new IntegrationRouteServiceError(
      404,
      "Inbound webhook configuration not found",
    );
  }

  return config;
}
