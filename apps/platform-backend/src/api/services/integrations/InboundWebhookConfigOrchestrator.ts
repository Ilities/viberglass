import crypto from "crypto";
import { ProjectIntegrationLinkDAO } from "../../../persistence/integrations";
import { WebhookConfigDAO } from "../../../persistence/webhook/WebhookConfigDAO";
import type { UpsertInboundWebhookConfigInput } from "./types";
import { getDefaultInboundEvents, serializeInboundWebhookConfig } from "./shared";
import { IntegrationWebhookContextResolver } from "./IntegrationWebhookContextResolver";
import { IntegrationRouteServiceError } from "./errors";
import {
  ensureProjectLink,
  getInboundConfigForIntegrationOrThrow,
  normalizeOptionalId,
  resolveProjectId,
} from "./integrationWebhookOrchestratorUtils";

export class InboundWebhookConfigOrchestrator {
  constructor(
    private readonly contextResolver = new IntegrationWebhookContextResolver(),
    private readonly projectLinkDAO = new ProjectIntegrationLinkDAO(),
    private readonly webhookConfigDAO = new WebhookConfigDAO(),
  ) {}

  async listInboundWebhookConfigs(integrationId: string) {
    const { integration, provider } = await this.contextResolver.resolveContextOrThrow(
      integrationId,
      "Integration does not support webhooks",
    );

    const inboundConfigs = await this.webhookConfigDAO.listByIntegrationId(
      integration.id,
      { activeOnly: false },
    );

    return inboundConfigs
      .filter((config) => config.provider === provider)
      .map((config) => serializeInboundWebhookConfig(config));
  }

  async createInboundWebhookConfig(
    integrationId: string,
    input: UpsertInboundWebhookConfigInput,
  ) {
    const { integration, provider, providerPolicy } =
      await this.contextResolver.resolveContextOrThrow(
        integrationId,
        "Integration does not support inbound webhooks",
      );
    if (!providerPolicy.targetsOneSpace) {
      const existing = await this.webhookConfigDAO.listByIntegrationId(integration.id, { activeOnly: false });
      if (existing.some((config) => config.provider === provider)) {
        throw new IntegrationRouteServiceError(409, "The connection already has a webhook");
      }
    }

    const webhookSecret = input.generateSecret
      ? crypto.randomBytes(32).toString("hex")
      : input.webhookSecret;
    const projectId = providerPolicy.targetsOneSpace
      ? await resolveProjectId(this.projectLinkDAO, integration.id, input.projectId)
      : null;
    await ensureProjectLink(this.projectLinkDAO, projectId, integration.id);

    const created = await this.webhookConfigDAO.createConfig({
      projectId,
      provider,
      integrationId: integration.id,
      allowedEvents: input.allowedEvents || getDefaultInboundEvents(provider),
      planNewIssues: providerPolicy.targetsOneSpace ? (input.planNewIssues ?? false) : false,
      botUsername: input.botUsername?.trim() || null,
      webhookSecretEncrypted: webhookSecret || null,
      secretLocation: "database",
      active: input.active ?? true,
    });

    return serializeInboundWebhookConfig(created, webhookSecret || undefined);
  }

  async updateInboundWebhookConfig(
    integrationId: string,
    configId: string,
    input: UpsertInboundWebhookConfigInput,
  ) {
    const { integration, providerPolicy } =
      await this.contextResolver.resolveContextOrThrow(
        integrationId,
        "Integration does not support inbound webhooks",
      );
    const existing = await getInboundConfigForIntegrationOrThrow(
      this.webhookConfigDAO,
      integration.id,
      configId,
    );
    const webhookSecret = input.generateSecret
      ? crypto.randomBytes(32).toString("hex")
      : input.webhookSecret;
    const space = providerPolicy.targetsOneSpace
      ? {
          projectId: input.projectId !== undefined ? normalizeOptionalId(input.projectId) : existing.projectId,
          planNewIssues: input.planNewIssues,
        }
      : {};
    await ensureProjectLink(this.projectLinkDAO, space.projectId ?? null, integration.id);

    await this.webhookConfigDAO.updateConfig(configId, {
      ...space,
      allowedEvents: input.allowedEvents,
      ...(input.botUsername !== undefined ? { botUsername: input.botUsername?.trim() || null } : {}),
      webhookSecretEncrypted: webhookSecret,
      active: input.active,
    });

    const updated = await this.webhookConfigDAO.getConfigById(configId);
    if (!updated) {
      throw new IntegrationRouteServiceError(
        404,
        "Inbound webhook configuration not found",
      );
    }

    return serializeInboundWebhookConfig(updated, webhookSecret || undefined);
  }

  async deleteInboundWebhookConfig(integrationId: string, configId: string) {
    const integration = await this.contextResolver.getIntegrationOrThrow(
      integrationId,
    );
    await getInboundConfigForIntegrationOrThrow(
      this.webhookConfigDAO,
      integration.id,
      configId,
    );
    await this.webhookConfigDAO.deleteConfig(configId);
  }
}
