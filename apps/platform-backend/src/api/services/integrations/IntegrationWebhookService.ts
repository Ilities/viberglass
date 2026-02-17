import crypto from "crypto";
import type { ParsedQs } from "qs";
import {
  IntegrationDAO,
  ProjectIntegrationLinkDAO,
} from "../../../persistence/integrations";
import { WebhookConfigDAO } from "../../../persistence/webhook/WebhookConfigDAO";
import { WebhookDeliveryDAO } from "../../../persistence/webhook/WebhookDeliveryDAO";
import logger from "../../../config/logger";
import { getWebhookService } from "../../../webhooks/webhookServiceFactory";
import { IntegrationRouteServiceError } from "./errors";
import type {
  DeliveryListResult,
  RetryInboundDeliveryResult,
  UpsertInboundWebhookConfigInput,
  UpsertOutboundWebhookConfigInput,
} from "./types";
import {
  getDefaultInboundEvents,
  getDefaultOutboundEvents,
  getProviderProjectIdFromIntegration,
  mapSystemToWebhookProvider,
  parseCustomOutboundTargetConfigOrError,
  parseDeliveryStatuses,
  parseNonNegativeInt,
  serializeInboundWebhookConfig,
  serializeOutboundWebhookConfig,
  serializeWebhookDelivery,
} from "./shared";

const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GITHUB_AUTO_EXECUTE_MODE_MATCHING_EVENTS = "matching_events";
const GITHUB_AUTO_EXECUTE_MODE_LABEL_GATED = "label_gated";

// Helper to safely convert unknown values to a JSON-compatible object
function toJsonObject(
  value: unknown,
): import("../../../persistence/types/database").JsonObject | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object") return undefined;
  if (Array.isArray(value)) return undefined;
  return value as import("../../../persistence/types/database").JsonObject;
}

type GitHubAutoExecuteMode =
  | typeof GITHUB_AUTO_EXECUTE_MODE_MATCHING_EVENTS
  | typeof GITHUB_AUTO_EXECUTE_MODE_LABEL_GATED;

export class IntegrationWebhookService {
  constructor(
    private readonly integrationDAO = new IntegrationDAO(),
    private readonly projectLinkDAO = new ProjectIntegrationLinkDAO(),
    private readonly webhookConfigDAO = new WebhookConfigDAO(),
    private readonly webhookDeliveryDAO = new WebhookDeliveryDAO(),
  ) {}

  async listInboundWebhookConfigs(integrationId: string) {
    const integration = await this.getIntegrationOrThrow(integrationId);

    const provider = mapSystemToWebhookProvider(integration.system);
    if (!provider) {
      throw new IntegrationRouteServiceError(
        400,
        "Integration does not support webhooks",
      );
    }

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
    const integration = await this.getIntegrationOrThrow(integrationId);

    const provider = mapSystemToWebhookProvider(integration.system);
    if (!provider) {
      throw new IntegrationRouteServiceError(
        400,
        "Integration does not support inbound webhooks",
      );
    }

    let webhookSecret = input.webhookSecret;
    if (input.generateSecret) {
      webhookSecret = crypto.randomBytes(32).toString("hex");
    }

    const projectId = await this.resolveProjectId(
      integration.id,
      input.projectId,
    );
    const providerProjectId = this.resolveProviderProjectId(
      provider,
      input.providerProjectId,
      integration.config,
    );
    this.validateProviderProjectId(provider, providerProjectId);
    const labelMappings = this.resolveInboundLabelMappings(
      provider,
      input.labelMappings,
    );
    await this.ensureProjectLink(projectId, integration.id);

    const created = await this.webhookConfigDAO.createConfig({
      projectId,
      provider,
      direction: "inbound",
      integrationId: integration.id,
      providerProjectId,
      allowedEvents: input.allowedEvents || getDefaultInboundEvents(provider),
      autoExecute: input.autoExecute ?? false,
      webhookSecretEncrypted: webhookSecret || null,
      labelMappings: toJsonObject(
        labelMappings,
      ) as import("../../../persistence/types/database").JsonObject,
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
    const integration = await this.getIntegrationOrThrow(integrationId);

    const existing = await this.getInboundConfigForIntegrationOrThrow(
      integration.id,
      configId,
    );
    const provider = mapSystemToWebhookProvider(integration.system);
    if (!provider) {
      throw new IntegrationRouteServiceError(
        400,
        "Integration does not support inbound webhooks",
      );
    }

    let webhookSecret = input.webhookSecret;
    if (input.generateSecret) {
      webhookSecret = crypto.randomBytes(32).toString("hex");
    }

    const providerProjectId =
      input.providerProjectId !== undefined
        ? this.normalizeOptionalId(input.providerProjectId)
        : existing.providerProjectId;
    if (input.providerProjectId !== undefined) {
      this.validateProviderProjectId(provider, providerProjectId);
    }

    const labelMappings = this.resolveInboundLabelMappings(
      provider,
      input.labelMappings,
      existing.labelMappings,
    );
    const nextProjectId =
      input.projectId !== undefined
        ? this.normalizeOptionalId(input.projectId)
        : existing.projectId;
    await this.ensureProjectLink(nextProjectId, integration.id);

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
    const integration = await this.getIntegrationOrThrow(integrationId);

    await this.getInboundConfigForIntegrationOrThrow(integration.id, configId);

    await this.webhookConfigDAO.deleteConfig(configId);
  }

  async listOutboundWebhookConfigs(integrationId: string) {
    const integration = await this.getIntegrationOrThrow(integrationId);

    const provider = mapSystemToWebhookProvider(integration.system);
    if (!provider) {
      throw new IntegrationRouteServiceError(
        400,
        "Integration does not support outbound webhook events",
      );
    }

    const outboundConfigs = await this.webhookConfigDAO.listByIntegrationId(
      integration.id,
      {
        direction: "outbound",
        activeOnly: false,
      },
    );

    return outboundConfigs
      .filter((config) => config.provider === provider)
      .map((config) => serializeOutboundWebhookConfig(config));
  }

  async createOutboundWebhookConfig(
    integrationId: string,
    input: UpsertOutboundWebhookConfigInput,
  ) {
    const integration = await this.getIntegrationOrThrow(integrationId);

    const provider = mapSystemToWebhookProvider(integration.system);
    if (!provider) {
      throw new IntegrationRouteServiceError(
        400,
        "Integration does not support outbound webhook events",
      );
    }

    const existingConfigs = await this.webhookConfigDAO.listByIntegrationId(
      integration.id,
      {
        direction: "outbound",
        activeOnly: false,
      },
    );

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

    const projectId = await this.resolveProjectId(
      integration.id,
      input.projectId,
    );
    const providerProjectId = this.resolveProviderProjectId(
      provider,
      input.providerProjectId,
      integration.config,
    );
    this.validateProviderProjectId(provider, providerProjectId);
    const allowedEvents = this.isAlwaysOnOutboundProvider(provider)
      ? getDefaultOutboundEvents()
      : input.events || getDefaultOutboundEvents();
    await this.ensureProjectLink(projectId, integration.id);

    const created = await this.webhookConfigDAO.createConfig({
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
    const integration = await this.getIntegrationOrThrow(integrationId);

    const config = await this.getOutboundConfigForIntegrationOrThrow(
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
    const integration = await this.getIntegrationOrThrow(integrationId);

    const provider = mapSystemToWebhookProvider(integration.system);
    if (!provider) {
      throw new IntegrationRouteServiceError(
        400,
        "Integration does not support outbound webhook events",
      );
    }

    const existing = await this.getOutboundConfigForIntegrationOrThrow(
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
        ? this.normalizeOptionalId(input.providerProjectId)
        : existing.providerProjectId;
    if (input.providerProjectId !== undefined) {
      this.validateProviderProjectId(provider, providerProjectId);
    }
    const nextProjectId =
      input.projectId !== undefined
        ? this.normalizeOptionalId(input.projectId)
        : existing.projectId;
    await this.ensureProjectLink(nextProjectId, integration.id);

    await this.webhookConfigDAO.updateConfig(configId, {
      projectId: nextProjectId,
      allowedEvents: this.isAlwaysOnOutboundProvider(provider)
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

    const updated = await this.webhookConfigDAO.getConfigById(configId);
    if (!updated) {
      throw new IntegrationRouteServiceError(
        404,
        "Outbound webhook configuration not found",
      );
    }

    return serializeOutboundWebhookConfig(updated);
  }

  async deleteOutboundWebhookConfig(integrationId: string, configId: string) {
    const integration = await this.getIntegrationOrThrow(integrationId);

    const config = await this.getOutboundConfigForIntegrationOrThrow(
      integration.id,
      configId,
    );
    if (this.isAlwaysOnOutboundProvider(config.provider)) {
      const providerLabel = this.getProviderLabel(config.provider);
      throw new IntegrationRouteServiceError(
        400,
        `${providerLabel} outbound webhook is required and cannot be removed`,
      );
    }

    await this.webhookConfigDAO.deleteConfig(configId);
  }

  async listOutboundWebhookDeliveries(
    integrationId: string,
    configId: string,
    query: ParsedQs | { [key: string]: unknown },
  ): Promise<DeliveryListResult> {
    const integration = await this.getIntegrationOrThrow(integrationId);

    const config = await this.getOutboundConfigForIntegrationOrThrow(
      integration.id,
      configId,
    );

    const statusFilter = parseDeliveryStatuses(query);
    if (statusFilter.invalidValues.length > 0) {
      throw new IntegrationRouteServiceError(
        400,
        `Invalid delivery statuses: ${statusFilter.invalidValues.join(", ")}`,
      );
    }

    const limit = parseNonNegativeInt(query.limit, 50);
    const offset = parseNonNegativeInt(query.offset, 0);
    const deliveries = await this.webhookDeliveryDAO.listDeliveriesByConfig(
      config.id,
      {
        statuses: statusFilter.statuses,
        limit,
        offset,
        sortOrder: "desc",
      },
    );

    return {
      data: deliveries.map((delivery) => serializeWebhookDelivery(delivery)),
      pagination: { limit, offset, count: deliveries.length },
    };
  }

  async listInboundWebhookDeliveries(
    integrationId: string,
    configId: string,
    query: ParsedQs | { [key: string]: unknown },
  ): Promise<DeliveryListResult> {
    const integration = await this.getIntegrationOrThrow(integrationId);

    const config = await this.getInboundConfigForIntegrationOrThrow(
      integration.id,
      configId,
    );

    const statusFilter = parseDeliveryStatuses(query);
    if (statusFilter.invalidValues.length > 0) {
      throw new IntegrationRouteServiceError(
        400,
        `Invalid delivery statuses: ${statusFilter.invalidValues.join(", ")}`,
      );
    }

    const limit = parseNonNegativeInt(query.limit, 50);
    const offset = parseNonNegativeInt(query.offset, 0);
    const deliveries = await this.webhookDeliveryDAO.listDeliveriesByConfig(
      config.id,
      {
        statuses: statusFilter.statuses,
        limit,
        offset,
        sortOrder: "desc",
      },
    );

    return {
      data: deliveries.map((delivery) => serializeWebhookDelivery(delivery)),
      pagination: { limit, offset, count: deliveries.length },
    };
  }

  async retryInboundWebhookDelivery(
    integrationId: string,
    configId: string,
    deliveryId: string,
  ): Promise<RetryInboundDeliveryResult> {
    const integration = await this.getIntegrationOrThrow(integrationId);

    const config = await this.getInboundConfigForIntegrationOrThrow(
      integration.id,
      configId,
    );

    const delivery = await this.webhookDeliveryDAO.getDeliveryByIdForConfig(
      deliveryId,
      config.id,
    );
    if (!delivery) {
      throw new IntegrationRouteServiceError(
        404,
        "Delivery not found for this webhook configuration",
      );
    }

    if (delivery.status === "succeeded") {
      return {
        message: "Delivery retry completed with no action",
        data: {
          delivery: serializeWebhookDelivery(delivery),
          retry: {
            status: "duplicate",
            reason: "Delivery already succeeded",
          },
        },
      };
    }

    if (delivery.status !== "failed") {
      throw new IntegrationRouteServiceError(
        409,
        "Only failed deliveries can be retried",
      );
    }

    logger.info("Webhook delivery retry requested", {
      integrationId: integration.id,
      webhookConfigId: config.id,
      deliveryAttemptId: delivery.id,
      provider: delivery.provider,
      deliveryStatus: delivery.status,
    });

    const retryResult = await getWebhookService().retryDelivery(
      delivery.deliveryId,
      {
        deliveryAttemptId: delivery.id,
        webhookConfigId: config.id,
      },
    );

    const refreshedDelivery =
      (await this.webhookDeliveryDAO.getDeliveryByIdForConfig(
        delivery.id,
        config.id,
      )) || delivery;

    if (retryResult.status === "duplicate") {
      return {
        message: "Delivery retry completed with no action",
        data: {
          delivery: serializeWebhookDelivery(refreshedDelivery),
          retry: {
            status: retryResult.status,
            reason: retryResult.reason || "Delivery already succeeded",
            ticketId: retryResult.ticketId,
            jobId: retryResult.jobId,
          },
        },
      };
    }

    if (retryResult.status === "failed") {
      logger.warn("Webhook delivery retry failed", {
        integrationId: integration.id,
        webhookConfigId: config.id,
        deliveryAttemptId: refreshedDelivery.id,
        provider: refreshedDelivery.provider,
        reason: retryResult.reason,
      });
      throw new IntegrationRouteServiceError(422, "Retry failed", {
        error: "Retry failed",
        reason: retryResult.reason || "Unknown retry error",
        data: {
          delivery: serializeWebhookDelivery(refreshedDelivery),
          retry: {
            status: retryResult.status,
            reason: retryResult.reason,
          },
        },
      });
    }

    if (
      retryResult.status !== "processed" &&
      retryResult.status !== "ignored"
    ) {
      logger.error("Webhook delivery retry returned unsupported status", {
        integrationId: integration.id,
        webhookConfigId: config.id,
        deliveryAttemptId: refreshedDelivery.id,
        provider: refreshedDelivery.provider,
        retryStatus: retryResult.status,
      });
      throw new IntegrationRouteServiceError(
        500,
        "Unsupported retry result status",
      );
    }

    logger.info("Webhook delivery retry completed", {
      integrationId: integration.id,
      webhookConfigId: config.id,
      deliveryAttemptId: refreshedDelivery.id,
      provider: refreshedDelivery.provider,
      retryStatus: retryResult.status,
      ticketId: retryResult.ticketId,
      jobId: retryResult.jobId,
    });

    return {
      message:
        retryResult.status === "processed"
          ? "Delivery retried successfully"
          : "Delivery retry completed with no action",
      data: {
        delivery: serializeWebhookDelivery(refreshedDelivery),
        retry: {
          status: retryResult.status,
          reason: retryResult.reason,
          ticketId: retryResult.ticketId,
          jobId: retryResult.jobId,
        },
      },
    };
  }

  private async getIntegrationOrThrow(integrationId: string) {
    const integration = await this.integrationDAO.getIntegration(integrationId);
    if (!integration) {
      throw new IntegrationRouteServiceError(404, "Integration not found");
    }
    return integration;
  }

  private async getInboundConfigForIntegrationOrThrow(
    integrationId: string,
    configId: string,
  ) {
    const config = await this.webhookConfigDAO.getByIntegrationAndConfigId(
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

  private async getOutboundConfigForIntegrationOrThrow(
    integrationId: string,
    configId: string,
  ) {
    const config = await this.webhookConfigDAO.getByIntegrationAndConfigId(
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

  private normalizeOptionalId(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeLabelArray(rawLabels: unknown): string[] {
    if (!Array.isArray(rawLabels)) {
      return [];
    }

    const labels: string[] = [];
    for (const rawLabel of rawLabels) {
      if (typeof rawLabel !== "string") {
        continue;
      }

      const normalized = rawLabel.trim().toLowerCase();
      if (!normalized || labels.includes(normalized)) {
        continue;
      }
      labels.push(normalized);
    }

    return labels;
  }

  private toRecord(value: unknown): { [key: string]: unknown } | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    return value as { [key: string]: unknown };
  }

  private parseGitHubAutoExecuteMode(labelMappings: {
    [key: string]: unknown;
  }): GitHubAutoExecuteMode | undefined {
    const root = this.toRecord(labelMappings);
    const nested = this.toRecord(root?.github);
    const source = nested || root;
    if (!source) {
      return undefined;
    }

    const rawMode = source.autoExecuteMode ?? source.mode;
    if (typeof rawMode !== "string") {
      return undefined;
    }

    const normalizedMode = rawMode.trim().toLowerCase();
    if (
      normalizedMode !== GITHUB_AUTO_EXECUTE_MODE_MATCHING_EVENTS &&
      normalizedMode !== GITHUB_AUTO_EXECUTE_MODE_LABEL_GATED
    ) {
      throw new IntegrationRouteServiceError(
        400,
        `GitHub auto-execute mode must be "${GITHUB_AUTO_EXECUTE_MODE_MATCHING_EVENTS}" or "${GITHUB_AUTO_EXECUTE_MODE_LABEL_GATED}"`,
      );
    }

    return normalizedMode as GitHubAutoExecuteMode;
  }

  private resolveInboundLabelMappings(
    provider: NonNullable<ReturnType<typeof mapSystemToWebhookProvider>>,
    inputLabelMappings: { [key: string]: unknown } | undefined,
    existingLabelMappings?: { [key: string]: unknown },
  ): { [key: string]: unknown } {
    if (inputLabelMappings === undefined) {
      return existingLabelMappings || {};
    }

    const normalizedInput = this.toRecord(inputLabelMappings);
    if (!normalizedInput) {
      return {};
    }

    if (provider !== "github") {
      return normalizedInput;
    }

    const mode = this.parseGitHubAutoExecuteMode(normalizedInput);
    if (!mode) {
      return {};
    }

    if (mode === GITHUB_AUTO_EXECUTE_MODE_MATCHING_EVENTS) {
      return {
        github: {
          autoExecuteMode: GITHUB_AUTO_EXECUTE_MODE_MATCHING_EVENTS,
        },
      };
    }

    const nested = this.toRecord(normalizedInput.github);
    const source = nested || normalizedInput;
    const labels = this.normalizeLabelArray(
      source.requiredLabels ?? source.labels,
    );
    if (labels.length === 0) {
      throw new IntegrationRouteServiceError(
        400,
        "GitHub label-gated auto-execute requires at least one label",
      );
    }

    return {
      github: {
        autoExecuteMode: GITHUB_AUTO_EXECUTE_MODE_LABEL_GATED,
        requiredLabels: labels,
      },
    };
  }

  private isAlwaysOnOutboundProvider(
    provider: NonNullable<ReturnType<typeof mapSystemToWebhookProvider>>,
  ): boolean {
    return (
      provider === "github" || provider === "jira" || provider === "shortcut"
    );
  }

  private getProviderLabel(
    provider: NonNullable<ReturnType<typeof mapSystemToWebhookProvider>>,
  ): string {
    if (provider === "jira") {
      return "Jira";
    }
    if (provider === "shortcut") {
      return "Shortcut";
    }
    if (provider === "github") {
      return "GitHub";
    }
    return provider;
  }

  private validateProviderProjectId(
    provider: NonNullable<ReturnType<typeof mapSystemToWebhookProvider>>,
    providerProjectId: string | null,
  ): void {
    if (provider !== "github" || !providerProjectId) {
      return;
    }

    if (!GITHUB_REPOSITORY_PATTERN.test(providerProjectId)) {
      throw new IntegrationRouteServiceError(
        400,
        'GitHub repository mapping must use "owner/repo" format',
      );
    }
  }

  private resolveProviderProjectId(
    provider: NonNullable<ReturnType<typeof mapSystemToWebhookProvider>>,
    inputProviderProjectId: string | null | undefined,
    integrationValues: { [key: string]: unknown },
  ): string | null {
    const explicitProviderProjectId = this.normalizeOptionalId(
      inputProviderProjectId,
    );
    if (explicitProviderProjectId) {
      return explicitProviderProjectId;
    }

    if (provider === "shortcut") {
      return null;
    }

    if (provider === "jira") {
      return null;
    }

    return (
      getProviderProjectIdFromIntegration(provider, integrationValues) || null
    );
  }

  private async resolveProjectId(
    integrationId: string,
    explicitProjectId: string | null | undefined,
  ): Promise<string | null> {
    if (explicitProjectId !== undefined) {
      return this.normalizeOptionalId(explicitProjectId);
    }

    const projectLinks =
      await this.projectLinkDAO.getIntegrationProjects(integrationId);
    return projectLinks[0]?.projectId || null;
  }

  private async ensureProjectLink(
    projectId: string | null,
    integrationId: string,
  ): Promise<void> {
    if (!projectId) {
      return;
    }

    const isLinked = await this.projectLinkDAO.isLinked(
      projectId,
      integrationId,
    );
    if (isLinked) {
      return;
    }

    await this.projectLinkDAO.linkIntegration({
      projectId,
      integrationId,
      isPrimary: false,
    });
  }
}
