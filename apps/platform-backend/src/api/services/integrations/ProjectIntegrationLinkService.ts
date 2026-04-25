import { IntegrationRegistry } from "@viberglass/integration-core";
import type { TicketSystem } from '@viberglass/types'
import { IntegrationDAO, ProjectIntegrationLinkDAO } from '../../../persistence/integrations'
import { ProjectDAO } from '../../../persistence/project/ProjectDAO'
import { IntegrationRouteServiceError } from './errors'
import type { LinkProjectIntegrationInput } from './types'

const integrationRegistry = new IntegrationRegistry();

export class ProjectIntegrationLinkService {
  constructor(
    private readonly integrationDAO = new IntegrationDAO(),
    private readonly projectLinkDAO = new ProjectIntegrationLinkDAO(),
    private readonly projectDAO = new ProjectDAO(),
  ) {}

  async getProjectIntegrations(projectId: string) {
    const links = await this.projectLinkDAO.getProjectIntegrations(projectId)

    return links.map((link) => ({
      linkId: link.id,
      projectId: link.projectId,
      integrationId: link.integrationId,
      isPrimary: link.isPrimary,
      createdAt: link.createdAt,
      integration: link.integration,
    }))
  }

  async linkProjectIntegration(projectId: string, input: LinkProjectIntegrationInput) {
    const { integrationId, isPrimary } = input

    if (!integrationId) {
      throw new IntegrationRouteServiceError(400, 'Missing required field: integrationId')
    }

    const integration = await this.integrationDAO.getIntegration(integrationId)
    if (!integration) {
      throw new IntegrationRouteServiceError(404, 'Integration not found')
    }

    const isAlreadyLinked = await this.projectLinkDAO.isLinked(projectId, integrationId)
    if (isAlreadyLinked) {
      throw new IntegrationRouteServiceError(409, 'Integration is already linked to this project')
    }

    const link = await this.projectLinkDAO.linkIntegration({
      projectId,
      integrationId,
      isPrimary: isPrimary ?? false,
    })

    // Update category-specific primary fields
    if (isPrimary) {
      await this.updateProjectPrimaryIntegration(projectId, integration.system, integrationId)
    }

    return link
  }

  private async updateProjectPrimaryIntegration(
    projectId: string,
    system: string,
    integrationId: string
  ): Promise<void> {
    // Determine category from integration system
    const plugin = integrationRegistry.get(system as TicketSystem)
    if (!plugin) return

    const isScm = plugin.category === 'scm'
    
    if (isScm) {
      await this.projectDAO.updateProject(projectId, {
        primaryScmIntegrationId: integrationId,
      })
    } else {
      await this.projectDAO.updateProject(projectId, {
        primaryTicketingIntegrationId: integrationId,
      })
    }
  }

  async unlinkProjectIntegration(projectId: string, integrationId: string) {
    // Get integration details before unlinking to check if it's primary
    const integration = await this.integrationDAO.getIntegration(integrationId)
    
    const deleted = await this.projectLinkDAO.unlinkIntegration(projectId, integrationId)

    if (!deleted) {
      throw new IntegrationRouteServiceError(404, 'Integration link not found')
    }

    // Clear category-specific primary column if this was the primary integration
    if (integration) {
      await this.clearProjectPrimaryIntegrationIfNeeded(projectId, integrationId, integration.system)
    }
  }

  private async clearProjectPrimaryIntegrationIfNeeded(
    projectId: string,
    unlinkedIntegrationId: string,
    system: string
  ): Promise<void> {
    // Determine category from integration system
    const plugin = integrationRegistry.get(system as TicketSystem)
    if (!plugin) return

    const isScm = plugin.category === 'scm'
    
    // Get current project state
    const project = await this.projectDAO.getProject(projectId)
    if (!project) return

    // Clear the primary integration ID if it matches the unlinked integration
    if (isScm && project.primaryScmIntegrationId === unlinkedIntegrationId) {
      await this.projectDAO.updateProject(projectId, {
        primaryScmIntegrationId: null,
      })
    } else if (!isScm && project.primaryTicketingIntegrationId === unlinkedIntegrationId) {
      await this.projectDAO.updateProject(projectId, {
        primaryTicketingIntegrationId: null,
      })
    }
  }

  async setPrimaryProjectIntegration(projectId: string, integrationId: string) {
    const isLinked = await this.projectLinkDAO.isLinked(projectId, integrationId)
    if (!isLinked) {
      throw new IntegrationRouteServiceError(404, 'Integration is not linked to this project')
    }

    await this.projectLinkDAO.setPrimaryIntegration(projectId, integrationId)

    // Also update the category-specific primary column
    const integration = await this.integrationDAO.getIntegration(integrationId)
    if (integration) {
      await this.updateProjectPrimaryIntegration(projectId, integration.system, integrationId)
    }
  }
}
