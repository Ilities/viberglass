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
  resolveProviderProjectId,
  toJsonObject,
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
      {
        direction: "inbound",
        activeOnly: false,
      },
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

    const webhookSecret = input.generateSecret
      ? crypto.randomBytes(32).toString("hex")
      : input.webhookSecret;
    const projectId = await resolveProjectId(
      this.projectLinkDAO,
      integration.id,
      input.projectId,
    );
    const providerProjectId = resolveProviderProjectId(
      provider,
      providerPolicy,
      input.providerProjectId,
      integration.config,
    );
    providerPolicy.validateProviderProjectId(providerProjectId);
    const labelMappings = providerPolicy.normalizeInboundLabelMappings(
      input.labelMappings,
    );
    await ensureProjectLink(this.projectLinkDAO, projectId, integration.id);

    const created = await this.webhookConfigDAO.createConfig({
      projectId,
      provider,
      direction: "inbound",
      integrationId: integration.id,
      providerProjectId,
      allowedEvents: input.allowedEvents || getDefaultInboundEvents(provider),
      autoExecute: input.autoExecute ?? false,
      webhookSecretEncrypted: webhookSecret || null,
      labelMappings: toJsonObject(labelMappings),
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
    const providerProjectId =
      input.providerProjectId !== undefined
        ? normalizeOptionalId(input.providerProjectId)
        : existing.providerProjectId;
    if (input.providerProjectId !== undefined) {
      providerPolicy.validateProviderProjectId(providerProjectId);
    }
    const labelMappings = providerPolicy.normalizeInboundLabelMappings(
      input.labelMappings,
      existing.labelMappings,
    );
    const nextProjectId =
      input.projectId !== undefined
        ? normalizeOptionalId(input.projectId)
        : existing.projectId;
    await ensureProjectLink(this.projectLinkDAO, nextProjectId, integration.id);

    await this.webhookConfigDAO.updateConfig(configId, {
      projectId: nextProjectId,
      providerProjectId,
      allowedEvents: input.allowedEvents,
      autoExecute: input.autoExecute,
      webhookSecretEncrypted: webhookSecret,
      labelMappings: toJsonObject(labelMappings),
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
