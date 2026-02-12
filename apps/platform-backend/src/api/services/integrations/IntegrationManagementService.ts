import { IntegrationDAO, ProjectIntegrationLinkDAO } from '../../../persistence/integrations'
import { integrationRegistry } from '../../../integrations/TicketingIntegrationRegistry'
import type { AuthCredentials, TicketSystem } from '@viberglass/types'
import { INTEGRATION_DESCRIPTIONS } from '@viberglass/types'
import { IntegrationRouteServiceError } from './errors'
import type { CreateIntegrationInput, UpdateIntegrationInput } from './types'

export class IntegrationManagementService {
  constructor(
    private readonly integrationDAO = new IntegrationDAO(),
    private readonly projectLinkDAO = new ProjectIntegrationLinkDAO(),
  ) {}

  async listIntegrations(system?: TicketSystem) {
    return this.integrationDAO.listIntegrations(system)
  }

  async createIntegration(input: CreateIntegrationInput) {
    const { name, system, authType, values } = input

    if (!name || !system || !authType) {
      throw new IntegrationRouteServiceError(
        400,
        'Missing required fields: name, system, authType',
      )
    }

    const plugin = integrationRegistry.get(system as TicketSystem)
    if (!plugin) {
      throw new IntegrationRouteServiceError(400, `Invalid integration system: ${system}`)
    }

    if (plugin.status === 'stub') {
      throw new IntegrationRouteServiceError(400, 'Integration is not available yet')
    }

    return this.integrationDAO.createIntegration({
      name,
      system: system as TicketSystem,
      authType,
      values: values || {},
    })
  }

  async getIntegration(integrationId: string) {
    return this.getIntegrationOrThrow(integrationId)
  }

  async updateIntegration(integrationId: string, input: UpdateIntegrationInput) {
    await this.getIntegrationOrThrow(integrationId)

    return this.integrationDAO.updateIntegration(integrationId, {
      name: input.name,
      authType: input.authType,
      values: input.values,
      isActive: input.isActive,
    })
  }

  async deleteIntegration(integrationId: string) {
    await this.getIntegrationOrThrow(integrationId)

    await this.projectLinkDAO.deleteAllLinksForIntegration(integrationId)
    await this.integrationDAO.deleteIntegration(integrationId, true)
  }

  async testIntegration(integrationId: string) {
    const integration = await this.getIntegrationOrThrow(integrationId)

    const plugin = integrationRegistry.get(integration.system)
    if (!plugin) {
      throw new IntegrationRouteServiceError(404, 'Integration plugin not found')
    }

    if (plugin.status === 'stub') {
      throw new IntegrationRouteServiceError(400, 'Integration is not available yet')
    }

    const config = {
      type: integration.authType,
      ...integration.values,
    } as AuthCredentials & Record<string, unknown>

    try {
      const integrationInstance = plugin.createIntegration(config)
      await integrationInstance.authenticate(config)

      return {
        success: true,
        message: 'Connection successful',
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to authenticate integration',
      }
    }
  }

  async listAvailableTypes() {
    const plugins = integrationRegistry.list()
    return plugins.map((plugin) => ({
      id: plugin.id,
      label: plugin.label,
      category: plugin.category,
      description: INTEGRATION_DESCRIPTIONS[plugin.id] || plugin.label,
      authTypes: plugin.authTypes,
      configFields: plugin.configFields,
      supports: plugin.supports,
      status: plugin.status,
    }))
  }

  private async getIntegrationOrThrow(integrationId: string) {
    const integration = await this.integrationDAO.getIntegration(integrationId)
    if (!integration) {
      throw new IntegrationRouteServiceError(404, 'Integration not found')
    }
    return integration
  }
}
