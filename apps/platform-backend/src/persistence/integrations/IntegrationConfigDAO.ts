import db from '../config/database'
import type { TicketSystem } from '@viberglass/types'

/**
 * @deprecated This DAO is being replaced by IntegrationDAO and ProjectIntegrationLinkDAO.
 * It now uses the new top-level integrations table via the project_integrations join table.
 * This file will be removed in a future version.
 */

export interface StoredIntegrationConfig {
  authType: string
  values: Record<string, unknown>
}

export interface IntegrationConfigRecord {
  id: string
  projectId: string
  system: TicketSystem
  config: StoredIntegrationConfig
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * @deprecated Use IntegrationDAO and ProjectIntegrationLinkDAO instead.
 * This class provides backward compatibility during the transition period.
 */
export class IntegrationConfigDAO {
  async listConfigs(projectId: string): Promise<IntegrationConfigRecord[]> {
    const rows = await db
      .selectFrom('integrations')
      .innerJoin('project_integrations', 'project_integrations.integration_id', 'integrations.id')
      .selectAll('integrations')
      .where('project_integrations.project_id', '=', projectId)
      .where('integrations.is_active', '=', true)
      .execute()

    return rows.map((row) => this.mapRowToConfig(row, projectId))
  }

  async getConfig(
    projectId: string,
    system: TicketSystem
  ): Promise<IntegrationConfigRecord | null> {
    const row = await db
      .selectFrom('integrations')
      .innerJoin('project_integrations', 'project_integrations.integration_id', 'integrations.id')
      .selectAll('integrations')
      .where('project_integrations.project_id', '=', projectId)
      .where('integrations.system', '=', system)
      .where('integrations.is_active', '=', true)
      .executeTakeFirst()

    if (!row) return null

    return this.mapRowToConfig(row, projectId)
  }

  async upsertConfig(
    projectId: string,
    system: TicketSystem,
    config: StoredIntegrationConfig
  ): Promise<IntegrationConfigRecord> {
    // Check if a link already exists
    const existingLink = await db
      .selectFrom('project_integrations')
      .innerJoin('integrations', 'integrations.id', 'project_integrations.integration_id')
      .select(['integrations.id', 'integrations.config'])
      .where('project_integrations.project_id', '=', projectId)
      .where('integrations.system', '=', system)
      .executeTakeFirst()

    const configPayload = JSON.stringify(config)

    if (existingLink) {
      // Update the existing integration
      const updated = await db
        .updateTable('integrations')
        .set({
          config: configPayload,
          is_active: true,
          updated_at: new Date(),
        })
        .where('id', '=', existingLink.id)
        .returningAll()
        .executeTakeFirstOrThrow()

      return this.mapRowToConfig(updated, projectId)
    }

    // This method is deprecated - creating new integrations should be done via IntegrationDAO
    // and linked via ProjectIntegrationLinkDAO
    throw new Error(
      'Creating new integrations via IntegrationConfigDAO is deprecated. ' +
        'Use IntegrationDAO.createIntegration() and ProjectIntegrationLinkDAO.linkIntegration() instead.'
    )
  }

  async deleteConfig(projectId: string, system: TicketSystem): Promise<boolean> {
    // Find the integration link
    const link = await db
      .selectFrom('project_integrations')
      .innerJoin('integrations', 'integrations.id', 'project_integrations.integration_id')
      .select('project_integrations.id')
      .where('project_integrations.project_id', '=', projectId)
      .where('integrations.system', '=', system)
      .executeTakeFirst()

    if (!link) return false

    // Delete the link (not the integration itself - it's now a shared resource)
    const result = await db
      .deleteFrom('project_integrations')
      .where('id', '=', link.id)
      .executeTakeFirst()

    return (result.numDeletedRows ?? 0) > 0
  }

  private mapRowToConfig(row: Record<string, unknown>, projectId: string): IntegrationConfigRecord {
    const rawConfig = row.config
    const parsedConfig: StoredIntegrationConfig =
      typeof rawConfig === 'string'
        ? (JSON.parse(rawConfig) as StoredIntegrationConfig)
        : (rawConfig as StoredIntegrationConfig)

    return {
      id: String(row.id),
      projectId,
      system: row.system as TicketSystem,
      config: parsedConfig,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    }
  }
}
