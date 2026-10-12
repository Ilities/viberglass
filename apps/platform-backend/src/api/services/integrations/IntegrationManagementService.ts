import {
  IntegrationDAO,
  ProjectIntegrationLinkDAO,
  IntegrationCredentialDAO,
  IntegrationUsageDAO,
} from "../../../persistence/integrations";
import { WebhookConfigDAO } from "../../../persistence/webhook/WebhookConfigDAO";
import { integrationRegistry } from "../../../integrations/registerIntegrationPlugins";
import type { TicketSystem } from "@viberglass/types";
import { manifestOf } from "@viberglass/integration-core";
import { IntegrationRouteServiceError } from "./errors";
import type { CreateIntegrationInput, UpdateIntegrationInput } from "./types";
import { ConnectionCredentialsResolver } from "../../../services/trackers/ConnectionCredentialsResolver";
import { ConnectionSecretFields } from "./ConnectionSecretFields";
import { connectionChanged } from "./connectionChangeListeners";

export class IntegrationManagementService {
  constructor(
    private readonly integrationDAO = new IntegrationDAO(),
    private readonly projectLinkDAO = new ProjectIntegrationLinkDAO(),
    private readonly webhookConfigDAO = new WebhookConfigDAO(),
    private readonly credentialDAO = new IntegrationCredentialDAO(),
    private readonly credentials: Pick<ConnectionCredentialsResolver, "resolve"> = new ConnectionCredentialsResolver(),
    private readonly usageDAO = new IntegrationUsageDAO(),
    private readonly secretFields: Pick<ConnectionSecretFields, "split" | "save" | "removeAll"> = new ConnectionSecretFields(),
    private readonly onChanged: (system: string) => Promise<void> = connectionChanged,
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

    const fields = this.secretFields.split(plugin.configFields, config || {});
    const integration = await this.integrationDAO.createIntegration({ name, system, config: fields.config });
    await this.secretFields.save(integration, fields.values);
    await this.onChanged(system);
    return integration;
  }

  async getIntegration(integrationId: string) {
    return this.getIntegrationOrThrow(integrationId);
  }

  async updateIntegration(
    integrationId: string,
    input: UpdateIntegrationInput,
  ) {
    const existing = await this.getIntegrationOrThrow(integrationId);
    const configFields = integrationRegistry.get(existing.system)?.configFields ?? [];
    const fields = input.config ? this.secretFields.split(configFields, input.config) : { config: undefined, values: [] };

    const integration = await this.integrationDAO.updateIntegration(integrationId, {
      name: input.name,
      config: fields.config,
      isActive: input.isActive,
    });
    await this.secretFields.save(integration, fields.values);
    await this.onChanged(integration.system);
    return integration;
  }

  async deleteIntegration(integrationId: string) {
    const integration = await this.getIntegrationOrThrow(integrationId);

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
    await this.secretFields.removeAll(integrationId);
    await this.credentialDAO.deleteAllForIntegration(integrationId);

    // 3. Delete project integration links (these reference integrations)
    await this.projectLinkDAO.deleteAllLinksForIntegration(integrationId);

    // 4. Finally delete the integration itself
    await this.integrationDAO.deleteIntegration(integrationId, true);
    await this.onChanged(integration.system);
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
      await plugin.checkConnection?.(credentials);

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
    return integrationRegistry.list().map(manifestOf);
  }

  private async getIntegrationOrThrow(integrationId: string) {
    const integration = await this.integrationDAO.getIntegration(integrationId);
    if (!integration) {
      throw new IntegrationRouteServiceError(404, "Integration not found");
    }
    return integration;
  }
}
