import {
  IntegrationDAO,
  ProjectIntegrationLinkDAO,
  IntegrationCredentialDAO,
  IntegrationUsageDAO,
} from "../../../persistence/integrations";
import { WebhookConfigDAO } from "../../../persistence/webhook/WebhookConfigDAO";
import { integrationRegistry } from "../../../integrations/registerIntegrationPlugins";
import type { TicketSystem } from "@viberglass/types";
import { INTEGRATION_DESCRIPTIONS } from "@viberglass/types";
import { IntegrationRouteServiceError } from "./errors";
import type { CreateIntegrationInput, UpdateIntegrationInput } from "./types";
import { ConnectionCredentialsResolver } from "../../../services/trackers/ConnectionCredentialsResolver";

export class IntegrationManagementService {
  constructor(
    private readonly integrationDAO = new IntegrationDAO(),
    private readonly projectLinkDAO = new ProjectIntegrationLinkDAO(),
    private readonly webhookConfigDAO = new WebhookConfigDAO(),
    private readonly credentialDAO = new IntegrationCredentialDAO(),
    private readonly credentials: Pick<ConnectionCredentialsResolver, "resolve"> = new ConnectionCredentialsResolver(),
    private readonly usageDAO = new IntegrationUsageDAO(),
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

    const plugin = integrationRegistry.get(system);
    if (!plugin) {
      throw new IntegrationRouteServiceError(
        400,
        `Invalid integration system: ${system}`,
      );
    }

    if (plugin.status === "stub") {
      throw new IntegrationRouteServiceError(
        400,
        "This connection isn't available yet",
      );
    }

    return this.integrationDAO.createIntegration({
      name,
      system: system,
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

    // Deleting cascades to project repository settings, so a project using
    // this integration would silently lose its repository and credential.
    const users = await this.usageDAO.listProjectsUsing(integrationId);
    if (users.length > 0) {
      const names = users.map((user) => user.projectName).join(", ");
      const message = `This connection is used by ${names}. Remove it from ${users.length === 1 ? "that space" : "those spaces"} first.`;
      throw new IntegrationRouteServiceError(409, message, {
        error: message,
        projects: users,
      });
    }

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
        "This connection isn't available yet",
      );
    }

    const credentials = await this.credentials.resolve(integration);

    try {
      const integrationInstance = plugin.createIntegration(
        credentials,
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
