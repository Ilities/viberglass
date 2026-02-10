import type { Request, Response } from 'express'
import crypto from 'crypto'
import { IntegrationDAO, ProjectIntegrationLinkDAO } from '../../persistence/integrations'
import { WebhookConfigDAO, type WebhookProvider } from '../../persistence/webhook/WebhookConfigDAO'
import { WebhookDeliveryDAO } from '../../persistence/webhook/WebhookDeliveryDAO'
import logger from '../../config/logger'
import { integrationRegistry } from '../../integrations/TicketingIntegrationRegistry'
import type { AuthCredentials, TicketSystem } from '@viberglass/types'
import { INTEGRATION_DESCRIPTIONS } from '@viberglass/types'

function mapSystemToWebhookProvider(system: string): WebhookProvider | null {
  if (system === 'github' || system === 'jira' || system === 'shortcut' || system === 'custom') {
    return system
  }
  return null
}

function getDefaultInboundEvents(provider: WebhookProvider): string[] {
  switch (provider) {
    case 'github':
      return ['issues.opened', 'issue_comment.created']
    case 'jira':
      return ['issue_created', 'issue_updated', 'comment_created']
    case 'shortcut':
      return ['story_created', 'story_updated', 'comment_created']
    case 'custom':
      return ['ticket_created']
    default:
      return ['*']
  }
}

function getDefaultOutboundEvents(): string[] {
  return ['job_started', 'job_ended']
}

function getProviderProjectIdFromIntegration(
  provider: WebhookProvider,
  integrationValues: Record<string, unknown>,
): string | null {
  if (provider === 'github') {
    const owner = typeof integrationValues.owner === 'string' ? integrationValues.owner : null
    const repo = typeof integrationValues.repo === 'string' ? integrationValues.repo : null
    if (owner && repo) {
      return `${owner}/${repo}`
    }
    return null
  }

  if (provider === 'jira') {
    const projectKey =
      typeof integrationValues.projectKey === 'string' ? integrationValues.projectKey : null
    return projectKey
  }

  if (provider === 'shortcut') {
    const projectId =
      typeof integrationValues.projectId === 'string'
        ? integrationValues.projectId
        : typeof integrationValues.projectId === 'number'
          ? String(integrationValues.projectId)
          : null
    return projectId
  }

  return null
}

function serializeInboundWebhookConfig(
  config: {
    id: string
    provider: WebhookProvider
    allowedEvents: string[]
    autoExecute: boolean
    active: boolean
    webhookSecretEncrypted: string | null
    createdAt: Date
    updatedAt: Date
  },
  includeSecret?: string,
) {
  return {
    id: config.id,
    provider: config.provider,
    webhookUrl:
      config.provider === 'custom'
        ? `/api/webhooks/custom/${config.id}`
        : `/api/webhooks/${config.provider}`,
    events: config.allowedEvents,
    autoExecute: config.autoExecute,
    active: config.active,
    hasSecret: Boolean(config.webhookSecretEncrypted),
    webhookSecret: includeSecret,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  }
}

function serializeOutboundWebhookConfig(
  config: {
    id: string
    provider: WebhookProvider
    allowedEvents: string[]
    active: boolean
    apiTokenEncrypted: string | null
    providerProjectId: string | null
    createdAt: Date
    updatedAt: Date
  },
) {
  return {
    id: config.id,
    provider: config.provider,
    events: config.allowedEvents,
    active: config.active,
    hasApiToken: Boolean(config.apiTokenEncrypted),
    providerProjectId: config.providerProjectId,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  }
}

function serializeWebhookDelivery(
  delivery: {
    id: string
    provider: WebhookProvider
    webhookConfigId: string | null
    deliveryId: string
    eventType: string
    status: 'pending' | 'processing' | 'succeeded' | 'failed'
    errorMessage: string | null
    ticketId: string | null
    createdAt: Date
    processedAt: Date | null
  },
) {
  return {
    id: delivery.id,
    provider: delivery.provider,
    webhookConfigId: delivery.webhookConfigId,
    deliveryId: delivery.deliveryId,
    eventType: delivery.eventType,
    status: delivery.status,
    errorMessage: delivery.errorMessage,
    ticketId: delivery.ticketId,
    createdAt: delivery.createdAt,
    processedAt: delivery.processedAt,
  }
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return parsed
}

export class IntegrationRouteService {
  private readonly integrationDAO = new IntegrationDAO()
  private readonly projectLinkDAO = new ProjectIntegrationLinkDAO()
  private readonly webhookConfigDAO = new WebhookConfigDAO()
  private readonly webhookDeliveryDAO = new WebhookDeliveryDAO()

  listIntegrations = async (req: Request, res: Response) => {
    try {
      const system = req.query.system as TicketSystem | undefined
      const integrations = await this.integrationDAO.listIntegrations(system)

      res.json({
        success: true,
        data: integrations,
      })
    } catch (error) {
      logger.error('Error fetching integrations', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  createIntegration = async (req: Request, res: Response) => {
    try {
      const { name, system, authType, values } = req.body

      if (!name || !system || !authType) {
        return res.status(400).json({
          error: 'Missing required fields: name, system, authType',
        })
      }

      const plugin = integrationRegistry.get(system as TicketSystem)
      if (!plugin) {
        return res.status(400).json({
          error: `Invalid integration system: ${system}`,
        })
      }

      if (plugin.status === 'stub') {
        return res.status(400).json({
          error: 'Integration is not available yet',
        })
      }

      const integration = await this.integrationDAO.createIntegration({
        name,
        system: system as TicketSystem,
        authType,
        values: values || {},
      })

      res.status(201).json({
        success: true,
        data: integration,
      })
    } catch (error) {
      logger.error('Error creating integration', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  getIntegration = async (req: Request, res: Response) => {
    try {
      const integration = await this.integrationDAO.getIntegration(req.params.id)

      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      res.json({
        success: true,
        data: integration,
      })
    } catch (error) {
      logger.error('Error fetching integration', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  updateIntegration = async (req: Request, res: Response) => {
    try {
      const existing = await this.integrationDAO.getIntegration(req.params.id)
      if (!existing) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      const { name, authType, values, isActive } = req.body
      const integration = await this.integrationDAO.updateIntegration(req.params.id, {
        name,
        authType,
        values,
        isActive,
      })

      res.json({
        success: true,
        data: integration,
      })
    } catch (error) {
      logger.error('Error updating integration', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  deleteIntegration = async (req: Request, res: Response) => {
    try {
      const existing = await this.integrationDAO.getIntegration(req.params.id)
      if (!existing) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      await this.projectLinkDAO.deleteAllLinksForIntegration(req.params.id)
      await this.integrationDAO.deleteIntegration(req.params.id, true)

      res.status(204).send()
    } catch (error) {
      logger.error('Error deleting integration', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  testIntegration = async (req: Request, res: Response) => {
    try {
      const integration = await this.integrationDAO.getIntegration(req.params.id)
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      const plugin = integrationRegistry.get(integration.system)
      if (!plugin) {
        return res.status(404).json({ error: 'Integration plugin not found' })
      }

      if (plugin.status === 'stub') {
        return res.status(400).json({ error: 'Integration is not available yet' })
      }

      const config = {
        type: integration.authType,
        ...integration.values,
      } as AuthCredentials & Record<string, unknown>

      try {
        const integrationInstance = plugin.createIntegration(config)
        await integrationInstance.authenticate(config)

        res.json({
          success: true,
          data: {
            success: true,
            message: 'Connection successful',
          },
        })
      } catch (error) {
        res.json({
          success: true,
          data: {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to authenticate integration',
          },
        })
      }
    } catch (error) {
      logger.error('Error testing integration', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  getProjectIntegrations = async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params
      const links = await this.projectLinkDAO.getProjectIntegrations(projectId)

      const result = links.map((link) => ({
        linkId: link.id,
        projectId: link.projectId,
        integrationId: link.integrationId,
        isPrimary: link.isPrimary,
        createdAt: link.createdAt,
        integration: link.integration,
      }))

      res.json({
        success: true,
        data: result,
      })
    } catch (error) {
      logger.error('Error fetching project integrations', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  linkProjectIntegration = async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params
      const { integrationId, isPrimary } = req.body

      if (!integrationId) {
        return res.status(400).json({
          error: 'Missing required field: integrationId',
        })
      }

      const integration = await this.integrationDAO.getIntegration(integrationId)
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      const isAlreadyLinked = await this.projectLinkDAO.isLinked(projectId, integrationId)
      if (isAlreadyLinked) {
        return res.status(409).json({
          error: 'Integration is already linked to this project',
        })
      }

      const link = await this.projectLinkDAO.linkIntegration({
        projectId,
        integrationId,
        isPrimary: isPrimary ?? false,
      })

      res.status(201).json({
        success: true,
        data: link,
      })
    } catch (error) {
      logger.error('Error linking integration to project', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  unlinkProjectIntegration = async (req: Request, res: Response) => {
    try {
      const { projectId, integrationId } = req.params

      const deleted = await this.projectLinkDAO.unlinkIntegration(projectId, integrationId)

      if (!deleted) {
        return res.status(404).json({ error: 'Integration link not found' })
      }

      res.status(204).send()
    } catch (error) {
      logger.error('Error unlinking integration from project', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  setPrimaryProjectIntegration = async (req: Request, res: Response) => {
    try {
      const { projectId, integrationId } = req.params

      const isLinked = await this.projectLinkDAO.isLinked(projectId, integrationId)
      if (!isLinked) {
        return res.status(404).json({ error: 'Integration is not linked to this project' })
      }

      await this.projectLinkDAO.setPrimaryIntegration(projectId, integrationId)

      res.json({
        success: true,
        message: 'Primary integration set successfully',
      })
    } catch (error) {
      logger.error('Error setting primary integration', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  listAvailableTypes = async (_req: Request, res: Response) => {
    try {
      const plugins = integrationRegistry.list()
      const available = plugins.map((plugin) => ({
        id: plugin.id,
        label: plugin.label,
        category: plugin.category,
        description: INTEGRATION_DESCRIPTIONS[plugin.id] || plugin.label,
        authTypes: plugin.authTypes,
        configFields: plugin.configFields,
        supports: plugin.supports,
        status: plugin.status,
      }))

      res.json({
        success: true,
        data: available,
      })
    } catch (error) {
      logger.error('Error fetching available integration types', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  listInboundWebhookConfigs = async (req: Request, res: Response) => {
    try {
      const integration = await this.integrationDAO.getIntegration(req.params.id)
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      const provider = mapSystemToWebhookProvider(integration.system)
      if (!provider) {
        return res.status(400).json({ error: 'Integration does not support webhooks' })
      }

      const inboundConfigs = await this.webhookConfigDAO.listByIntegrationId(integration.id, {
        direction: 'inbound',
        activeOnly: false,
      })

      res.json({
        success: true,
        data: inboundConfigs
          .filter((config) => config.provider === provider)
          .map((config) => serializeInboundWebhookConfig(config)),
      })
    } catch (error) {
      logger.error('Error listing inbound webhook configs', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  createInboundWebhookConfig = async (req: Request, res: Response) => {
    try {
      const integration = await this.integrationDAO.getIntegration(req.params.id)
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      const provider = mapSystemToWebhookProvider(integration.system)
      if (!provider) {
        return res.status(400).json({ error: 'Integration does not support inbound webhooks' })
      }

      const body = req.body as {
        projectId?: string
        allowedEvents?: string[]
        autoExecute?: boolean
        webhookSecret?: string
        generateSecret?: boolean
        providerProjectId?: string
        active?: boolean
      }

      let webhookSecret = body.webhookSecret
      if (body.generateSecret) {
        webhookSecret = crypto.randomBytes(32).toString('hex')
      }

      const projectLinks = await this.projectLinkDAO.getIntegrationProjects(integration.id)
      const projectId = body.projectId || (projectLinks.length > 0 ? projectLinks[0].projectId : null)
      const providerProjectId =
        body.providerProjectId ||
        getProviderProjectIdFromIntegration(provider, integration.values) ||
        null

      const created = await this.webhookConfigDAO.createConfig({
        projectId,
        provider,
        direction: 'inbound',
        integrationId: integration.id,
        providerProjectId,
        allowedEvents: body.allowedEvents || getDefaultInboundEvents(provider),
        autoExecute: body.autoExecute ?? false,
        webhookSecretEncrypted: webhookSecret || null,
        secretLocation: 'database',
        active: body.active ?? true,
      })

      res.status(201).json({
        success: true,
        data: serializeInboundWebhookConfig(created, webhookSecret || undefined),
      })
    } catch (error) {
      logger.error('Error creating inbound webhook config', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  updateInboundWebhookConfig = async (req: Request, res: Response) => {
    try {
      const integration = await this.integrationDAO.getIntegration(req.params.id)
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      const { configId } = req.params
      const existing = await this.webhookConfigDAO.getByIntegrationAndConfigId(integration.id, configId, {
        direction: 'inbound',
      })
      if (!existing) {
        return res.status(404).json({ error: 'Inbound webhook configuration not found' })
      }

      const body = req.body as {
        allowedEvents?: string[]
        autoExecute?: boolean
        webhookSecret?: string
        generateSecret?: boolean
        providerProjectId?: string
        active?: boolean
      }

      let webhookSecret = body.webhookSecret
      if (body.generateSecret) {
        webhookSecret = crypto.randomBytes(32).toString('hex')
      }

      await this.webhookConfigDAO.updateConfig(configId, {
        providerProjectId: body.providerProjectId,
        allowedEvents: body.allowedEvents,
        autoExecute: body.autoExecute,
        webhookSecretEncrypted: webhookSecret,
        active: body.active,
      })

      const updated = await this.webhookConfigDAO.getConfigById(configId)
      if (!updated) {
        return res.status(404).json({ error: 'Inbound webhook configuration not found' })
      }

      res.json({
        success: true,
        data: serializeInboundWebhookConfig(updated, webhookSecret || undefined),
      })
    } catch (error) {
      logger.error('Error updating inbound webhook config', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  deleteInboundWebhookConfig = async (req: Request, res: Response) => {
    try {
      const integration = await this.integrationDAO.getIntegration(req.params.id)
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      const { configId } = req.params
      const existing = await this.webhookConfigDAO.getByIntegrationAndConfigId(integration.id, configId, {
        direction: 'inbound',
      })
      if (!existing) {
        return res.status(404).json({ error: 'Inbound webhook configuration not found' })
      }

      await this.webhookConfigDAO.deleteConfig(configId)
      res.status(204).send()
    } catch (error) {
      logger.error('Error deleting inbound webhook config', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  listOutboundWebhookConfigs = async (req: Request, res: Response) => {
    try {
      const integration = await this.integrationDAO.getIntegration(req.params.id)
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      const provider = mapSystemToWebhookProvider(integration.system)
      if (!provider || provider === 'custom') {
        return res.status(400).json({ error: 'Integration does not support outbound webhook events' })
      }

      const outboundConfigs = await this.webhookConfigDAO.listByIntegrationId(integration.id, {
        direction: 'outbound',
        activeOnly: false,
      })

      res.json({
        success: true,
        data: outboundConfigs
          .filter((config) => config.provider === provider)
          .map((config) => serializeOutboundWebhookConfig(config)),
      })
    } catch (error) {
      logger.error('Error listing outbound webhook configs', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  createOutboundWebhookConfig = async (req: Request, res: Response) => {
    try {
      const integration = await this.integrationDAO.getIntegration(req.params.id)
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      const provider = mapSystemToWebhookProvider(integration.system)
      if (!provider || provider === 'custom') {
        return res.status(400).json({ error: 'Integration does not support outbound webhook events' })
      }

      const body = req.body as {
        projectId?: string
        events?: string[]
        apiToken?: string
        providerProjectId?: string
        active?: boolean
      }

      const existingConfigs = await this.webhookConfigDAO.listByIntegrationId(integration.id, {
        direction: 'outbound',
        activeOnly: false,
      })

      if (existingConfigs.some((config) => config.provider === provider)) {
        return res.status(409).json({
          error: 'Outbound webhook configuration already exists for this integration/provider',
        })
      }

      const projectLinks = await this.projectLinkDAO.getIntegrationProjects(integration.id)
      const projectId = body.projectId || (projectLinks.length > 0 ? projectLinks[0].projectId : null)
      const providerProjectId =
        body.providerProjectId ||
        getProviderProjectIdFromIntegration(provider, integration.values) ||
        null

      const created = await this.webhookConfigDAO.createConfig({
        projectId,
        provider,
        direction: 'outbound',
        integrationId: integration.id,
        providerProjectId,
        allowedEvents: body.events || getDefaultOutboundEvents(),
        apiTokenEncrypted: body.apiToken || null,
        autoExecute: false,
        secretLocation: 'database',
        active: body.active ?? true,
      })

      res.status(201).json({
        success: true,
        data: serializeOutboundWebhookConfig(created),
      })
    } catch (error) {
      logger.error('Error creating outbound webhook config', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  getOutboundWebhookConfig = async (req: Request, res: Response) => {
    try {
      const integration = await this.integrationDAO.getIntegration(req.params.id)
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      const { configId } = req.params
      const config = await this.webhookConfigDAO.getByIntegrationAndConfigId(integration.id, configId, {
        direction: 'outbound',
      })
      if (!config) {
        return res.status(404).json({ error: 'Outbound webhook configuration not found' })
      }

      res.json({
        success: true,
        data: serializeOutboundWebhookConfig(config),
      })
    } catch (error) {
      logger.error('Error fetching outbound webhook config', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  updateOutboundWebhookConfig = async (req: Request, res: Response) => {
    try {
      const integration = await this.integrationDAO.getIntegration(req.params.id)
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      const provider = mapSystemToWebhookProvider(integration.system)
      if (!provider || provider === 'custom') {
        return res.status(400).json({ error: 'Integration does not support outbound webhook events' })
      }

      const { configId } = req.params
      const existing = await this.webhookConfigDAO.getByIntegrationAndConfigId(integration.id, configId, {
        direction: 'outbound',
      })
      if (!existing) {
        return res.status(404).json({ error: 'Outbound webhook configuration not found' })
      }

      if (existing.provider !== provider) {
        return res.status(400).json({
          error: 'Outbound webhook configuration provider does not match integration provider',
        })
      }

      const body = req.body as {
        events?: string[]
        apiToken?: string
        providerProjectId?: string
        active?: boolean
      }

      await this.webhookConfigDAO.updateConfig(configId, {
        allowedEvents: body.events,
        apiTokenEncrypted: body.apiToken,
        providerProjectId: body.providerProjectId,
        active: body.active,
      })

      const updated = await this.webhookConfigDAO.getConfigById(configId)
      if (!updated) {
        return res.status(404).json({ error: 'Outbound webhook configuration not found' })
      }

      res.json({
        success: true,
        data: serializeOutboundWebhookConfig(updated),
      })
    } catch (error) {
      logger.error('Error updating outbound webhook config', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  deleteOutboundWebhookConfig = async (req: Request, res: Response) => {
    try {
      const integration = await this.integrationDAO.getIntegration(req.params.id)
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      const { configId } = req.params
      const existing = await this.webhookConfigDAO.getByIntegrationAndConfigId(integration.id, configId, {
        direction: 'outbound',
      })
      if (!existing) {
        return res.status(404).json({ error: 'Outbound webhook configuration not found' })
      }

      await this.webhookConfigDAO.deleteConfig(configId)
      res.status(204).send()
    } catch (error) {
      logger.error('Error deleting outbound webhook config', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  listInboundWebhookDeliveries = async (req: Request, res: Response) => {
    try {
      const integration = await this.integrationDAO.getIntegration(req.params.id)
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      const { configId } = req.params
      const config = await this.webhookConfigDAO.getByIntegrationAndConfigId(integration.id, configId, {
        direction: 'inbound',
      })
      if (!config) {
        return res.status(404).json({ error: 'Inbound webhook configuration not found' })
      }

      const limit = parseNonNegativeInt(req.query.limit as string | undefined, 50)
      const offset = parseNonNegativeInt(req.query.offset as string | undefined, 0)
      const deliveries = await this.webhookDeliveryDAO.listDeliveriesByConfig(config.id, {
        limit,
        offset,
        sortOrder: 'desc',
      })

      res.json({
        success: true,
        data: deliveries.map((delivery) => serializeWebhookDelivery(delivery)),
        pagination: { limit, offset, count: deliveries.length },
      })
    } catch (error) {
      logger.error('Error listing webhook deliveries', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  retryInboundWebhookDelivery = async (req: Request, res: Response) => {
    try {
      const integration = await this.integrationDAO.getIntegration(req.params.id)
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' })
      }

      const { configId, deliveryId } = req.params
      const config = await this.webhookConfigDAO.getByIntegrationAndConfigId(integration.id, configId, {
        direction: 'inbound',
      })
      if (!config) {
        return res.status(404).json({ error: 'Inbound webhook configuration not found' })
      }

      const delivery = await this.webhookDeliveryDAO.getDeliveryByIdForConfig(deliveryId, config.id)
      if (!delivery) {
        return res.status(404).json({ error: 'Delivery not found for this webhook configuration' })
      }

      if (delivery.status === 'succeeded') {
        return res.status(409).json({ error: 'Successful deliveries cannot be retried' })
      }

      await this.webhookDeliveryDAO.updateDeliveryStatus(
        delivery.id,
        'failed',
        'Marked for retry - please check provider webhook settings',
      )

      res.json({
        success: true,
        message: 'Delivery retry initiated',
        data: {
          deliveryId: delivery.id,
          webhookConfigId: config.id,
        },
      })
    } catch (error) {
      logger.error('Error retrying webhook delivery', {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
