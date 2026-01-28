import db from '../config/database'
import type { TicketSystem } from '@viberglass/types'

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

export class IntegrationConfigDAO {
  async listConfigs(projectId: string): Promise<IntegrationConfigRecord[]> {
    const rows = await db
      .selectFrom('pm_integrations')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('is_active', '=', true)
      .execute()

    return rows.map((row) => this.mapRowToConfig(row))
  }

  async getConfig(
    projectId: string,
    system: TicketSystem
  ): Promise<IntegrationConfigRecord | null> {
    const row = await db
      .selectFrom('pm_integrations')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('system', '=', system)
      .where('is_active', '=', true)
      .executeTakeFirst()

    if (!row) return null

    return this.mapRowToConfig(row)
  }

  async upsertConfig(
    projectId: string,
    system: TicketSystem,
    config: StoredIntegrationConfig
  ): Promise<IntegrationConfigRecord> {
    const existing = await db
      .selectFrom('pm_integrations')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('system', '=', system)
      .executeTakeFirst()

    const configPayload = JSON.stringify(config)

    if (existing) {
      const updated = await db
        .updateTable('pm_integrations')
        .set({
          config: configPayload,
          is_active: true,
          updated_at: new Date(),
        })
        .where('id', '=', existing.id as string)
        .returningAll()
        .executeTakeFirstOrThrow()

      return this.mapRowToConfig(updated)
    }

    const inserted = await db
      .insertInto('pm_integrations')
      .values({
        project_id: projectId,
        system,
        config: configPayload,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return this.mapRowToConfig(inserted)
  }

  async deleteConfig(projectId: string, system: TicketSystem): Promise<boolean> {
    const result = await db
      .deleteFrom('pm_integrations')
      .where('project_id', '=', projectId)
      .where('system', '=', system)
      .executeTakeFirst()

    return (result.numDeletedRows ?? 0) > 0
  }

  private mapRowToConfig(row: Record<string, unknown>): IntegrationConfigRecord {
    const rawConfig = row.config
    const parsedConfig =
      typeof rawConfig === 'string'
        ? (JSON.parse(rawConfig) as StoredIntegrationConfig)
        : (rawConfig as StoredIntegrationConfig)

    return {
      id: String(row.id),
      projectId: String(row.project_id),
      system: row.system as TicketSystem,
      config: parsedConfig,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    }
  }
}
