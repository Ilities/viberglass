import { v4 as uuidv4 } from 'uuid'
import db from '../config/database'
import type { Integration, TicketSystem } from '@viberglass/types'

export interface CreateIntegrationInput {
  name: string
  system: TicketSystem
  config: Record<string, unknown>
}

export interface UpdateIntegrationInput {
  name?: string
  config?: Record<string, unknown>
  isActive?: boolean
}

export class IntegrationDAO {
  /**
   * Create a new top-level integration
   */
  async createIntegration(input: CreateIntegrationInput): Promise<Integration> {
    const integrationId = uuidv4()
    const timestamp = new Date()

    const result = await db
      .insertInto('integrations')
      .values({
        id: integrationId,
        name: input.name,
        system: input.system,
        config: JSON.stringify(input.config),
        is_active: true,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return this.mapRowToIntegration(result)
  }

  /**
   * Get an integration by ID
   */
  async getIntegration(id: string): Promise<Integration | null> {
    const row = await db
      .selectFrom('integrations')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()

    if (!row) return null

    return this.mapRowToIntegration(row)
  }

  /**
   * List all integrations (optionally filtered by system)
   */
  async listIntegrations(system?: TicketSystem): Promise<Integration[]> {
    let query = db
      .selectFrom('integrations')
      .selectAll()
      .orderBy('created_at', 'desc')

    if (system) {
      query = query.where('system', '=', system)
    }

    const rows = await query.execute()
    return rows.map((row) => this.mapRowToIntegration(row))
  }

  /**
   * List integrations linked to a specific project
   */
  async listIntegrationsByProject(projectId: string): Promise<Integration[]> {
    const rows = await db
      .selectFrom('integrations')
      .innerJoin('project_integrations', 'project_integrations.integration_id', 'integrations.id')
      .selectAll('integrations')
      .where('project_integrations.project_id', '=', projectId)
      .where('integrations.is_active', '=', true)
      .orderBy('integrations.created_at', 'desc')
      .execute()

    return rows.map((row) => this.mapRowToIntegration(row))
  }

  /**
   * Update an integration
   */
  async updateIntegration(id: string, input: UpdateIntegrationInput): Promise<Integration> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    }

    if (input.name !== undefined) {
      updateData.name = input.name
    }

    if (input.isActive !== undefined) {
      updateData.is_active = input.isActive
    }

    // If config is being updated, merge with existing or set new
    if (input.config !== undefined) {
      const existing = await this.getIntegration(id)
      if (!existing) {
        throw new Error(`Integration ${id} not found`)
      }

      const newConfig = input.config
      updateData.config = JSON.stringify(newConfig)
    }

    const result = await db
      .updateTable('integrations')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow()

    return this.mapRowToIntegration(result)
  }

  /**
   * Delete an integration (soft delete by setting is_active = false)
   * Note: Hard delete will fail if there are linked projects due to FK constraints
   */
  async deleteIntegration(id: string, hardDelete = false): Promise<boolean> {
    if (hardDelete) {
      const result = await db.deleteFrom('integrations').where('id', '=', id).executeTakeFirst()
      return (result.numDeletedRows ?? 0) > 0
    }

    // Soft delete
    const result = await db
      .updateTable('integrations')
      .set({ is_active: false, updated_at: new Date() })
      .where('id', '=', id)
      .executeTakeFirst()

    return (result.numUpdatedRows ?? 0) > 0
  }

  /**
   * Get integrations by system type
   */
  async getIntegrationsBySystem(system: TicketSystem): Promise<Integration[]> {
    const rows = await db
      .selectFrom('integrations')
      .selectAll()
      .where('system', '=', system)
      .where('is_active', '=', true)
      .execute()

    return rows.map((row) => this.mapRowToIntegration(row))
  }

  /**
   * Map a database row to an Integration object
   */
  private mapRowToIntegration(row: Record<string, unknown>): Integration {
    const rawConfig = row.config
    const parsedConfig: Record<string, unknown> =
      typeof rawConfig === 'string'
        ? (JSON.parse(rawConfig) as Record<string, unknown>)
        : (rawConfig as Record<string, unknown>) ?? {}

    return {
      id: String(row.id),
      name: String(row.name),
      system: row.system as TicketSystem,
      config: parsedConfig,
      isActive: Boolean(row.is_active),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    }
  }
}
