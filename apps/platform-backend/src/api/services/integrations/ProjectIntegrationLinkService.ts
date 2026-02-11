import { IntegrationDAO, ProjectIntegrationLinkDAO } from '../../../persistence/integrations'
import { IntegrationRouteServiceError } from './errors'
import type { LinkProjectIntegrationInput } from './types'

export class ProjectIntegrationLinkService {
  constructor(
    private readonly integrationDAO = new IntegrationDAO(),
    private readonly projectLinkDAO = new ProjectIntegrationLinkDAO(),
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

    return this.projectLinkDAO.linkIntegration({
      projectId,
      integrationId,
      isPrimary: isPrimary ?? false,
    })
  }

  async unlinkProjectIntegration(projectId: string, integrationId: string) {
    const deleted = await this.projectLinkDAO.unlinkIntegration(projectId, integrationId)

    if (!deleted) {
      throw new IntegrationRouteServiceError(404, 'Integration link not found')
    }
  }

  async setPrimaryProjectIntegration(projectId: string, integrationId: string) {
    const isLinked = await this.projectLinkDAO.isLinked(projectId, integrationId)
    if (!isLinked) {
      throw new IntegrationRouteServiceError(404, 'Integration is not linked to this project')
    }

    await this.projectLinkDAO.setPrimaryIntegration(projectId, integrationId)
  }
}
