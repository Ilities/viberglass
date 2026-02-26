import {
  IntegrationDAO,
  ProjectIntegrationLinkDAO,
  IntegrationCredentialDAO,
} from "../../../persistence/integrations";
import { WebhookConfigDAO } from "../../../persistence/webhook/WebhookConfigDAO";
import { integrationRegistry } from "../../../integration-plugins";
import type { TicketSystem, AuthCredentials } from "@viberglass/types";
import { INTEGRATION_DESCRIPTIONS } from "@viberglass/types";
import { IntegrationRouteServiceError } from "./errors";
import type { CreateIntegrationInput, UpdateIntegrationInput } from "./types";
import { SecretService } from "../../../services/SecretService";

export class IntegrationManagementService {
  constructor(
    private readonly integrationDAO = new IntegrationDAO(),
    private readonly projectLinkDAO = new ProjectIntegrationLinkDAO(),
    private readonly webhookConfigDAO = new WebhookConfigDAO(),
    private readonly credentialDAO = new IntegrationCredentialDAO(),
    private readonly secretService = new SecretService(),
  ) {}

  async listIntegrations(system?: TicketSystem) {
    return this.integrationDAO.listIntegrations(system);
  }

  async createIntegration(input: CreateIntegrationInput) {
    const { name, system, config } = input;

    if (!name || !system) {
      throw new IntegrationRouteServiceError(
        400,
        "Missing required fields: name, system",
      );
    }

    const plugin = integrationRegistry.get(system as TicketSystem);
    if (!plugin) {
      throw new IntegrationRouteServiceError(
        400,
        `Invalid integration system: ${system}`,
      );
    }

    if (plugin.status === "stub") {
      throw new IntegrationRouteServiceError(
        400,
        "Integration is not available yet",
      );
    }

    return this.integrationDAO.createIntegration({
      name,
      system: system as TicketSystem,
      config: config || {},
    });
  }

  async getIntegration(integrationId: string) {
    return this.getIntegrationOrThrow(integrationId);
  }

  async updateIntegration(
    integrationId: string,
    input: UpdateIntegrationInput,
  ) {
    await this.getIntegrationOrThrow(integrationId);

    return this.integrationDAO.updateIntegration(integrationId, {
      name: input.name,
      config: input.config,
      isActive: input.isActive,
    });
  }

  async deleteIntegration(integrationId: string) {
    await this.getIntegrationOrThrow(integrationId);

    // Delete related data in proper order to handle foreign key constraints
    // 1. Delete webhook configurations (these reference integrations)
    await this.webhookConfigDAO.deleteAllForIntegration(integrationId);

    // 2. Delete integration credentials (these reference integrations with ON DELETE CASCADE)
    await this.credentialDAO.deleteAllForIntegration(integrationId);

    // 3. Delete project integration links (these reference integrations)
    await this.projectLinkDAO.deleteAllLinksForIntegration(integrationId);

    // 4. Finally delete the integration itself
    await this.integrationDAO.deleteIntegration(integrationId, true);
  }

  async testIntegration(integrationId: string) {
    const integration = await this.getIntegrationOrThrow(integrationId);

    const plugin = integrationRegistry.get(integration.system);
    if (!plugin) {
      throw new IntegrationRouteServiceError(
        404,
        "Integration plugin not found",
      );
    }

    if (plugin.status === "stub") {
      throw new IntegrationRouteServiceError(
        400,
        "Integration is not available yet",
      );
    }

    // Build credentials from integration config
    // The config may contain secretName which references a secret in the secrets system
    const credentials = await this.resolveCredentials(integration.config);

    try {
      const integrationInstance = plugin.createIntegration(
        credentials as unknown as AuthCredentials & Record<string, unknown>,
      );
      await integrationInstance.authenticate(credentials);

      return {
        success: true,
        message: "Connection successful",
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to authenticate integration",
      };
    }
  }

  /**
   * Resolve credentials from integration config
   * If the config contains a secretName, look up the secret value from the secrets system
   */
  private async resolveCredentials(
    config: Record<string, unknown>,
  ): Promise<AuthCredentials> {
    // Default to token-based auth if not specified
    const resolved: AuthCredentials = {
      type: (config.authType as AuthCredentials["type"]) || "token",
      ...config,
    };

    // If secretName is specified, resolve the secret value
    if (typeof config.secretName === "string") {
      try {
        const secrets = await this.secretService.resolveSecrets();
        const secretValue = secrets[config.secretName];
        if (secretValue) {
          resolved.token = secretValue;
        }
      } catch {
        // Secret resolution failed, continue without it
        // The plugin will handle the missing credential appropriately
      }
    }

    return resolved;
  }

  async listAvailableTypes() {
    const plugins = integrationRegistry.list();
    return plugins.map((plugin) => ({
      id: plugin.id,
      label: plugin.label,
      category: plugin.category,
      description: INTEGRATION_DESCRIPTIONS[plugin.id] || plugin.label,
      configFields: plugin.configFields,
      supports: plugin.supports,
      status: plugin.status,
    }));
  }

  private async getIntegrationOrThrow(integrationId: string) {
    const integration = await this.integrationDAO.getIntegration(integrationId);
    if (!integration) {
      throw new IntegrationRouteServiceError(404, "Integration not found");
    }
    return integration;
  }
}
