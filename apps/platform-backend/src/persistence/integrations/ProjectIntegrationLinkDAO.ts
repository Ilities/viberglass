import { v4 as uuidv4 } from 'uuid'
import db from '../config/database'
import type { ProjectIntegrationLink, ProjectIntegrationLinkWithCategory, TicketSystem, IntegrationCategory } from '@viberglass/types'

export interface CreateProjectIntegrationLinkInput {
  projectId: string
  integrationId: string
  isPrimary?: boolean
}

export interface ProjectIntegrationWithDetails extends ProjectIntegrationLink {
  integration: {
    id: string
    name: string
    system: TicketSystem
    isActive: boolean
  }
}

export class ProjectIntegrationLinkDAO {
  /**
   * Link an integration to a project
   */
  async linkIntegration(input: CreateProjectIntegrationLinkInput): Promise<ProjectIntegrationLink> {
    const linkId = uuidv4()
    const timestamp = new Date()

    // If this is set as primary, unset any existing primary for this project
    if (input.isPrimary) {
      await db
        .updateTable('project_integrations')
        .set({ is_primary: false })
        .where('project_id', '=', input.projectId)
        .execute()
    }

    const result = await db
      .insertInto('project_integrations')
      .values({
        id: linkId,
        project_id: input.projectId,
        integration_id: input.integrationId,
        is_primary: input.isPrimary ?? false,
        created_at: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return this.mapRowToLink(result)
  }

  /**
   * Unlink an integration from a project
   */
  async unlinkIntegration(projectId: string, integrationId: string): Promise<boolean> {
    const result = await db
      .deleteFrom('project_integrations')
      .where('project_id', '=', projectId)
      .where('integration_id', '=', integrationId)
      .executeTakeFirst()

    return (result.numDeletedRows ?? 0) > 0
  }

  /**
   * Get all integrations linked to a project (with details and category)
   */
  async getProjectIntegrations(projectId: string): Promise<ProjectIntegrationWithDetails[]> {
    const rows = await db
      .selectFrom('project_integrations')
      .innerJoin('integrations', 'integrations.id', 'project_integrations.integration_id')
      .select([
        'project_integrations.id',
        'project_integrations.project_id',
        'project_integrations.integration_id',
        'project_integrations.is_primary',
        'project_integrations.created_at',
        'integrations.name as integration_name',
        'integrations.system as integration_system',
        'integrations.is_active as integration_is_active',
      ])
      .where('project_integrations.project_id', '=', projectId)
      .orderBy('project_integrations.is_primary', 'desc')
      .orderBy('project_integrations.created_at', 'desc')
      .execute()

    return rows.map((row) => this.mapRowToLinkWithDetails(row))
  }

  /**
   * Get all integrations linked to a project with their categories
   */
  async getProjectIntegrationsWithCategory(projectId: string): Promise<ProjectIntegrationLinkWithCategory[]> {
    const rows = await db
      .selectFrom('project_integrations')
      .innerJoin('integrations', 'integrations.id', 'project_integrations.integration_id')
      .select([
        'project_integrations.id',
        'project_integrations.project_id',
        'project_integrations.integration_id',
        'project_integrations.is_primary',
        'project_integrations.created_at',
        'integrations.system as integration_system',
      ])
      .where('project_integrations.project_id', '=', projectId)
      .orderBy('project_integrations.is_primary', 'desc')
      .orderBy('project_integrations.created_at', 'desc')
      .execute()

    return rows.map((row) => this.mapRowToLinkWithCategory(row))
  }

  /**
   * Get all projects linked to an integration
   */
  async getIntegrationProjects(integrationId: string): Promise<ProjectIntegrationLink[]> {
    const rows = await db
      .selectFrom('project_integrations')
      .selectAll()
      .where('integration_id', '=', integrationId)
      .orderBy('is_primary', 'desc')
      .orderBy('created_at', 'desc')
      .execute()

    return rows.map((row) => this.mapRowToLink(row))
  }

  /**
   * Set an integration as the primary one for a project
   * @deprecated Use ProjectIntegrationLinkService with category-specific columns instead
   */
  async setPrimaryIntegration(projectId: string, integrationId: string): Promise<void> {
    // First, unset any existing primary
    await db
      .updateTable('project_integrations')
      .set({ is_primary: false })
      .where('project_id', '=', projectId)
      .execute()

    // Then set the new primary
    await db
      .updateTable('project_integrations')
      .set({ is_primary: true })
      .where('project_id', '=', projectId)
      .where('integration_id', '=', integrationId)
      .execute()
  }

  /**
   * Get the primary integration for a project
   * @deprecated Use getPrimaryTicketingIntegration or getPrimaryScmIntegration instead
   */
  async getPrimaryIntegration(projectId: string): Promise<ProjectIntegrationWithDetails | null> {
    const row = await db
      .selectFrom('project_integrations')
      .innerJoin('integrations', 'integrations.id', 'project_integrations.integration_id')
      .select([
        'project_integrations.id',
        'project_integrations.project_id',
        'project_integrations.integration_id',
        'project_integrations.is_primary',
        'project_integrations.created_at',
        'integrations.name as integration_name',
        'integrations.system as integration_system',
        'integrations.is_active as integration_is_active',
      ])
      .where('project_integrations.project_id', '=', projectId)
      .where('project_integrations.is_primary', '=', true)
      .executeTakeFirst()

    if (!row) return null

    return this.mapRowToLinkWithDetails(row)
  }

  /**
   * Get the primary ticketing integration for a project using the category-specific column
   */
  async getPrimaryTicketingIntegration(projectId: string): Promise<ProjectIntegrationWithDetails | null> {
    // First get the primary ticketing integration ID from the projects table
    const project = await db
      .selectFrom('projects')
      .select('primary_ticketing_integration_id')
      .where('id', '=', projectId)
      .executeTakeFirst()

    const primaryIntegrationId = project?.primary_ticketing_integration_id
    if (!primaryIntegrationId) return null

    // Then fetch the integration details
    const row = await db
      .selectFrom('project_integrations')
      .innerJoin('integrations', 'integrations.id', 'project_integrations.integration_id')
      .select([
        'project_integrations.id',
        'project_integrations.project_id',
        'project_integrations.integration_id',
        'project_integrations.is_primary',
        'project_integrations.created_at',
        'integrations.name as integration_name',
        'integrations.system as integration_system',
        'integrations.is_active as integration_is_active',
      ])
      .where('project_integrations.project_id', '=', projectId)
      .where('project_integrations.integration_id', '=', primaryIntegrationId)
      .executeTakeFirst()

    if (!row) return null

    return this.mapRowToLinkWithDetails(row)
  }

  /**
   * Get the primary SCM integration for a project using the category-specific column
   */
  async getPrimaryScmIntegration(projectId: string): Promise<ProjectIntegrationWithDetails | null> {
    // First get the primary SCM integration ID from the projects table
    const project = await db
      .selectFrom('projects')
      .select('primary_scm_integration_id')
      .where('id', '=', projectId)
      .executeTakeFirst()

    const primaryIntegrationId = project?.primary_scm_integration_id
    if (!primaryIntegrationId) return null

    // Then fetch the integration details
    const row = await db
      .selectFrom('project_integrations')
      .innerJoin('integrations', 'integrations.id', 'project_integrations.integration_id')
      .select([
        'project_integrations.id',
        'project_integrations.project_id',
        'project_integrations.integration_id',
        'project_integrations.is_primary',
        'project_integrations.created_at',
        'integrations.name as integration_name',
        'integrations.system as integration_system',
        'integrations.is_active as integration_is_active',
      ])
      .where('project_integrations.project_id', '=', projectId)
      .where('project_integrations.integration_id', '=', primaryIntegrationId)
      .executeTakeFirst()

    if (!row) return null

    return this.mapRowToLinkWithDetails(row)
  }

  /**
   * Check if an integration is linked to a project
   */
  async isLinked(projectId: string, integrationId: string): Promise<boolean> {
    const row = await db
      .selectFrom('project_integrations')
      .select('id')
      .where('project_id', '=', projectId)
      .where('integration_id', '=', integrationId)
      .executeTakeFirst()

    return row !== undefined
  }

  /**
   * Get a specific link by ID
   */
  async getLinkById(linkId: string): Promise<ProjectIntegrationLink | null> {
    const row = await db
      .selectFrom('project_integrations')
      .selectAll()
      .where('id', '=', linkId)
      .executeTakeFirst()

    if (!row) return null

    return this.mapRowToLink(row)
  }

  /**
   * Delete all links for a project (useful when deleting a project)
   */
  async deleteAllLinksForProject(projectId: string): Promise<number> {
    const result = await db
      .deleteFrom('project_integrations')
      .where('project_id', '=', projectId)
      .executeTakeFirst()

    return Number(result.numDeletedRows ?? 0)
  }

  /**
   * Delete all links for an integration (useful when deleting an integration)
   */
  async deleteAllLinksForIntegration(integrationId: string): Promise<number> {
    const result = await db
      .deleteFrom('project_integrations')
      .where('integration_id', '=', integrationId)
      .executeTakeFirst()

    return Number(result.numDeletedRows ?? 0)
  }

  private mapRowToLink(row: Record<string, unknown>): ProjectIntegrationLink {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      integrationId: String(row.integration_id),
      isPrimary: Boolean(row.is_primary),
      createdAt: (row.created_at as Date).toISOString(),
    }
  }

  private mapRowToLinkWithDetails(row: Record<string, unknown>): ProjectIntegrationWithDetails {
    return {
      ...this.mapRowToLink(row),
      integration: {
        id: String(row.integration_id),
        name: String(row.integration_name),
        system: row.integration_system as TicketSystem,
        isActive: Boolean(row.integration_is_active),
      },
    }
  }

  private mapRowToLinkWithCategory(row: Record<string, unknown>): ProjectIntegrationLinkWithCategory {
    const system = row.integration_system as TicketSystem
    return {
      ...this.mapRowToLink(row),
      category: this.inferCategoryFromSystem(system),
    }
  }

  private inferCategoryFromSystem(system: TicketSystem): IntegrationCategory {
    const scmSystems: TicketSystem[] = ['github', 'gitlab', 'bitbucket']
    if (scmSystems.includes(system)) {
      return 'scm'
    }
    return 'ticketing'
  }
}
