import { ProjectIntegrationLinkDAO } from "../../../persistence/integrations";
import { WebhookConfigDAO } from "../../../persistence/webhook/WebhookConfigDAO";
import { IntegrationWebhookContextResolver } from "./IntegrationWebhookContextResolver";
import { IntegrationRouteServiceError } from "./errors";
import type { UpsertOutboundWebhookConfigInput } from "./types";
import {
  getDefaultOutboundEvents,
  parseCustomOutboundTargetConfigOrError,
  serializeOutboundWebhookConfig,
} from "./shared";
import {
  ensureProjectLink,
  getOutboundConfigForIntegrationOrThrow,
  normalizeOptionalId,
  resolveProjectId,
  resolveProviderProjectId,
  toJsonObject,
} from "./integrationWebhookOrchestratorUtils";

interface OutboundOrchestratorDeps {
  contextResolver: IntegrationWebhookContextResolver;
  projectLinkDAO: ProjectIntegrationLinkDAO;
  webhookConfigDAO: WebhookConfigDAO;
}

export class OutboundWebhookConfigOrchestrator {
  private readonly deps: OutboundOrchestratorDeps;

  constructor(
    contextResolver = new IntegrationWebhookContextResolver(),
    projectLinkDAO = new ProjectIntegrationLinkDAO(),
    webhookConfigDAO = new WebhookConfigDAO(),
  ) {
    this.deps = { contextResolver, projectLinkDAO, webhookConfigDAO };
  }

  async listOutboundWebhookConfigs(integrationId: string) {
    const { integration, provider } =
      await this.deps.contextResolver.resolveContextOrThrow(
        integrationId,
        "Integration does not support outbound webhook events",
      );
    const outboundConfigs =
      await this.deps.webhookConfigDAO.listByIntegrationId(integration.id, {
        direction: "outbound",
        activeOnly: false,
      });

    return outboundConfigs
      .filter((config) => config.provider === provider)
      .map((config) => serializeOutboundWebhookConfig(config));
  }

  async createOutboundWebhookConfig(
    integrationId: string,
    input: UpsertOutboundWebhookConfigInput,
  ) {
    const { integration, provider, providerPolicy } =
      await this.deps.contextResolver.resolveContextOrThrow(
        integrationId,
        "Integration does not support outbound webhook events",
      );
    const existingConfigs =
      await this.deps.webhookConfigDAO.listByIntegrationId(integration.id, {
        direction: "outbound",
        activeOnly: false,
      });
    if (
      provider !== "custom" &&
      existingConfigs.some((config) => config.provider === provider)
    ) {
      throw new IntegrationRouteServiceError(
        409,
        "Outbound webhook configuration already exists for this integration/provider",
      );
    }

    const customOutboundTargetConfig: {
      config?: { [key: string]: unknown } | null;
      error?: string;
    } =
      provider === "custom"
        ? parseCustomOutboundTargetConfigOrError(input, {
            requireNameAndUrl: true,
          })
        : { config: null };
    if (provider === "custom" && customOutboundTargetConfig.error) {
      throw new IntegrationRouteServiceError(
        400,
        customOutboundTargetConfig.error,
      );
    }

    const projectId = await resolveProjectId(
      this.deps.projectLinkDAO,
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
    const allowedEvents = providerPolicy.shouldRequireAlwaysOnOutboundEvents()
      ? getDefaultOutboundEvents()
      : input.events || getDefaultOutboundEvents();
    await ensureProjectLink(
      this.deps.projectLinkDAO,
      projectId,
      integration.id,
    );

    const created = await this.deps.webhookConfigDAO.createConfig({
      projectId,
      provider,
      direction: "outbound",
      integrationId: integration.id,
      providerProjectId,
      allowedEvents,
      apiTokenEncrypted: provider === "custom" ? null : input.apiToken || null,
      outboundTargetConfig:
        provider === "custom"
          ? toJsonObject(customOutboundTargetConfig.config) || null
          : null,
      autoExecute: false,
      secretLocation: "database",
      active: input.active ?? true,
    });

    return serializeOutboundWebhookConfig(created);
  }

  async getOutboundWebhookConfig(integrationId: string, configId: string) {
    const integration =
      await this.deps.contextResolver.getIntegrationOrThrow(integrationId);
    const config = await getOutboundConfigForIntegrationOrThrow(
      this.deps.webhookConfigDAO,
      integration.id,
      configId,
    );

    return serializeOutboundWebhookConfig(config);
  }

  async updateOutboundWebhookConfig(
    integrationId: string,
    configId: string,
    input: UpsertOutboundWebhookConfigInput,
  ) {
    const { integration, provider, providerPolicy } =
      await this.deps.contextResolver.resolveContextOrThrow(
        integrationId,
        "Integration does not support outbound webhook events",
      );
    const existing = await getOutboundConfigForIntegrationOrThrow(
      this.deps.webhookConfigDAO,
      integration.id,
      configId,
    );
    if (existing.provider !== provider) {
      throw new IntegrationRouteServiceError(
        400,
        "Outbound webhook configuration provider does not match integration provider",
      );
    }

    const customOutboundTargetConfig: {
      config?: { [key: string]: unknown } | null;
      error?: string;
    } =
      provider === "custom"
        ? parseCustomOutboundTargetConfigOrError(input, {
            existing: existing.outboundTargetConfig || null,
            requireNameAndUrl: true,
          })
        : { config: null };
    if (provider === "custom" && customOutboundTargetConfig.error) {
      throw new IntegrationRouteServiceError(
        400,
        customOutboundTargetConfig.error,
      );
    }

    const providerProjectId =
      input.providerProjectId !== undefined
        ? normalizeOptionalId(input.providerProjectId)
        : existing.providerProjectId;
    if (input.providerProjectId !== undefined) {
      providerPolicy.validateProviderProjectId(providerProjectId);
    }
    const nextProjectId =
      input.projectId !== undefined
        ? normalizeOptionalId(input.projectId)
        : existing.projectId;
    await ensureProjectLink(
      this.deps.projectLinkDAO,
      nextProjectId,
      integration.id,
    );

    await this.deps.webhookConfigDAO.updateConfig(configId, {
      projectId: nextProjectId,
      allowedEvents: providerPolicy.shouldRequireAlwaysOnOutboundEvents()
        ? getDefaultOutboundEvents()
        : input.events,
      apiTokenEncrypted: provider === "custom" ? undefined : input.apiToken,
      providerProjectId,
      outboundTargetConfig:
        provider === "custom"
          ? toJsonObject(customOutboundTargetConfig.config) || undefined
          : undefined,
      active: input.active,
    });

    const updated = await this.deps.webhookConfigDAO.getConfigById(configId);
    if (!updated) {
      throw new IntegrationRouteServiceError(
        404,
        "Outbound webhook configuration not found",
      );
    }

    return serializeOutboundWebhookConfig(updated);
  }

  async deleteOutboundWebhookConfig(integrationId: string, configId: string) {
    const integration =
      await this.deps.contextResolver.getIntegrationOrThrow(integrationId);
    const config = await getOutboundConfigForIntegrationOrThrow(
      this.deps.webhookConfigDAO,
      integration.id,
      configId,
    );
    const providerPolicy = this.deps.contextResolver.resolveProviderPolicy(
      config.provider,
    );
    if (providerPolicy.shouldRequireAlwaysOnOutboundEvents()) {
      throw new IntegrationRouteServiceError(
        400,
        `${providerPolicy.getProviderLabel()} outbound webhook is required and cannot be removed`,
      );
    }

    await this.deps.webhookConfigDAO.deleteConfig(configId);
  }
}
