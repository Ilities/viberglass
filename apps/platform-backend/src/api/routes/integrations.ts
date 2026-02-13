import express, { type Request, type Response } from 'express'
import type { TicketSystem } from '@viberglass/types'
import logger from '../../config/logger'
import { requireAuth } from '../middleware/authentication'
import {
  IntegrationManagementService,
  IntegrationWebhookService,
  ProjectIntegrationLinkService,
  isIntegrationRouteServiceError,
  type CreateIntegrationInput,
  type LinkProjectIntegrationInput,
  type UpdateIntegrationInput,
  type UpsertInboundWebhookConfigInput,
  type UpsertOutboundWebhookConfigInput,
} from '../services/integrations'
import { IntegrationCredentialDAO } from '../../persistence/integrations/IntegrationCredentialDAO'
import { SecretDAO } from '../../persistence/secret/SecretDAO'
import type {
  CreateIntegrationCredentialRequest,
  UpdateIntegrationCredentialRequest,
} from '@viberglass/types'

const router = express.Router()
const integrationManagementService = new IntegrationManagementService()
const projectIntegrationLinkService = new ProjectIntegrationLinkService()
const integrationWebhookService = new IntegrationWebhookService()
const integrationCredentialDAO = new IntegrationCredentialDAO()
const secretDAO = new SecretDAO()

router.use(requireAuth)

type AsyncRouteHandler = (req: Request, res: Response) => Promise<void>

function withRouteErrorHandling(
  logMessage: string,
  handler: AsyncRouteHandler,
): express.RequestHandler {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (error) {
      if (isIntegrationRouteServiceError(error)) {
        res.status(error.statusCode).json(error.body)
        return
      }

      logger.error(logMessage, {
        integrationId: req.params.id,
        projectId: req.params.projectId,
        configId: req.params.configId,
        deliveryId: req.params.deliveryId,
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// ============================================================================
// Top-level Integration Management
// ============================================================================

router.get(
  '/',
  withRouteErrorHandling('Error fetching integrations', async (req, res) => {
    const system = req.query.system as TicketSystem | undefined
    const integrations = await integrationManagementService.listIntegrations(system)

    res.json({
      success: true,
      data: integrations,
    })
  }),
)

router.post(
  '/',
  withRouteErrorHandling('Error creating integration', async (req, res) => {
    const integration = await integrationManagementService.createIntegration(
      req.body as CreateIntegrationInput,
    )

    res.status(201).json({
      success: true,
      data: integration,
    })
  }),
)

router.get(
  '/:id',
  withRouteErrorHandling('Error fetching integration', async (req, res) => {
    const integration = await integrationManagementService.getIntegration(req.params.id)

    res.json({
      success: true,
      data: integration,
    })
  }),
)

router.put(
  '/:id',
  withRouteErrorHandling('Error updating integration', async (req, res) => {
    const integration = await integrationManagementService.updateIntegration(
      req.params.id,
      req.body as UpdateIntegrationInput,
    )

    res.json({
      success: true,
      data: integration,
    })
  }),
)

router.delete(
  '/:id',
  withRouteErrorHandling('Error deleting integration', async (req, res) => {
    await integrationManagementService.deleteIntegration(req.params.id)
    res.status(204).send()
  }),
)

router.post(
  '/:id/test',
  withRouteErrorHandling('Error testing integration', async (req, res) => {
    const result = await integrationManagementService.testIntegration(req.params.id)

    res.json({
      success: true,
      data: result,
    })
  }),
)

// ============================================================================
// Project-Integration Link Management
// ============================================================================

router.get(
  '/project/:projectId',
  withRouteErrorHandling('Error fetching project integrations', async (req, res) => {
    const links = await projectIntegrationLinkService.getProjectIntegrations(req.params.projectId)

    res.json({
      success: true,
      data: links,
    })
  }),
)

router.post(
  '/project/:projectId/link',
  withRouteErrorHandling('Error linking integration to project', async (req, res) => {
    const link = await projectIntegrationLinkService.linkProjectIntegration(
      req.params.projectId,
      req.body as LinkProjectIntegrationInput,
    )

    res.status(201).json({
      success: true,
      data: link,
    })
  }),
)

router.delete(
  '/project/:projectId/link/:integrationId',
  withRouteErrorHandling('Error unlinking integration from project', async (req, res) => {
    await projectIntegrationLinkService.unlinkProjectIntegration(
      req.params.projectId,
      req.params.integrationId,
    )
    res.status(204).send()
  }),
)

router.put(
  '/project/:projectId/primary/:integrationId',
  withRouteErrorHandling('Error setting primary integration', async (req, res) => {
    await projectIntegrationLinkService.setPrimaryProjectIntegration(
      req.params.projectId,
      req.params.integrationId,
    )

    res.json({
      success: true,
      message: 'Primary integration set successfully',
    })
  }),
)

// ============================================================================
// Available Integration Types
// ============================================================================

router.get(
  '/types/available',
  withRouteErrorHandling('Error fetching available integration types', async (_req, res) => {
    const available = await integrationManagementService.listAvailableTypes()

    res.json({
      success: true,
      data: available,
    })
  }),
)

// ============================================================================
// Webhook configuration endpoints under integrations
// ============================================================================

router.get(
  '/:id/webhooks/inbound',
  withRouteErrorHandling('Error listing inbound webhook configs', async (req, res) => {
    const configs = await integrationWebhookService.listInboundWebhookConfigs(req.params.id)

    res.json({
      success: true,
      data: configs,
    })
  }),
)

router.post(
  '/:id/webhooks/inbound',
  withRouteErrorHandling('Error creating inbound webhook config', async (req, res) => {
    const config = await integrationWebhookService.createInboundWebhookConfig(
      req.params.id,
      req.body as UpsertInboundWebhookConfigInput,
    )

    res.status(201).json({
      success: true,
      data: config,
    })
  }),
)

router.put(
  '/:id/webhooks/inbound/:configId',
  withRouteErrorHandling('Error updating inbound webhook config', async (req, res) => {
    const config = await integrationWebhookService.updateInboundWebhookConfig(
      req.params.id,
      req.params.configId,
      req.body as UpsertInboundWebhookConfigInput,
    )

    res.json({
      success: true,
      data: config,
    })
  }),
)

router.delete(
  '/:id/webhooks/inbound/:configId',
  withRouteErrorHandling('Error deleting inbound webhook config', async (req, res) => {
    await integrationWebhookService.deleteInboundWebhookConfig(req.params.id, req.params.configId)
    res.status(204).send()
  }),
)

router.get(
  '/:id/webhooks/outbound',
  withRouteErrorHandling('Error listing outbound webhook configs', async (req, res) => {
    const configs = await integrationWebhookService.listOutboundWebhookConfigs(req.params.id)

    res.json({
      success: true,
      data: configs,
    })
  }),
)

router.post(
  '/:id/webhooks/outbound',
  withRouteErrorHandling('Error creating outbound webhook config', async (req, res) => {
    const config = await integrationWebhookService.createOutboundWebhookConfig(
      req.params.id,
      req.body as UpsertOutboundWebhookConfigInput,
    )

    res.status(201).json({
      success: true,
      data: config,
    })
  }),
)

router.get(
  '/:id/webhooks/outbound/:configId',
  withRouteErrorHandling('Error fetching outbound webhook config', async (req, res) => {
    const config = await integrationWebhookService.getOutboundWebhookConfig(
      req.params.id,
      req.params.configId,
    )

    res.json({
      success: true,
      data: config,
    })
  }),
)

router.put(
  '/:id/webhooks/outbound/:configId',
  withRouteErrorHandling('Error updating outbound webhook config', async (req, res) => {
    const config = await integrationWebhookService.updateOutboundWebhookConfig(
      req.params.id,
      req.params.configId,
      req.body as UpsertOutboundWebhookConfigInput,
    )

    res.json({
      success: true,
      data: config,
    })
  }),
)

router.delete(
  '/:id/webhooks/outbound/:configId',
  withRouteErrorHandling('Error deleting outbound webhook config', async (req, res) => {
    await integrationWebhookService.deleteOutboundWebhookConfig(req.params.id, req.params.configId)
    res.status(204).send()
  }),
)

router.get(
  '/:id/webhooks/outbound/:configId/deliveries',
  withRouteErrorHandling('Error listing outbound webhook deliveries', async (req, res) => {
    const result = await integrationWebhookService.listOutboundWebhookDeliveries(
      req.params.id,
      req.params.configId,
      req.query,
    )

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    })
  }),
)

router.get(
  '/:id/webhooks/inbound/:configId/deliveries',
  withRouteErrorHandling('Error listing webhook deliveries', async (req, res) => {
    const result = await integrationWebhookService.listInboundWebhookDeliveries(
      req.params.id,
      req.params.configId,
      req.query,
    )

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    })
  }),
)

router.post(
  '/:id/webhooks/inbound/:configId/deliveries/:deliveryId/retry',
  withRouteErrorHandling('Error retrying webhook delivery', async (req, res) => {
    const result = await integrationWebhookService.retryInboundWebhookDelivery(
      req.params.id,
      req.params.configId,
      req.params.deliveryId,
    )

    res.json({
      success: true,
      message: result.message,
      data: result.data,
    })
  }),
)

// ============================================================================
// Integration Credentials (SCM Credentials)
// ============================================================================

router.get(
  '/:id/credentials',
  withRouteErrorHandling('Error fetching integration credentials', async (req, res) => {
    const credentials = await integrationCredentialDAO.listByIntegrationId(req.params.id)
    res.json({ success: true, data: credentials })
  }),
)

router.post(
  '/:id/credentials',
  withRouteErrorHandling('Error creating integration credential', async (req, res) => {
    const body = req.body as CreateIntegrationCredentialRequest

    // Create a secret to store the credential value
    const secret = await secretDAO.createSecret({
      name: `integration-credential-${req.params.id}-${body.name}`,
      secretLocation: 'database',
      secretValueEncrypted: body.secretValue,
    })

    const credential = await integrationCredentialDAO.create({
      integrationId: req.params.id,
      name: body.name,
      credentialType: body.credentialType,
      secretId: secret.id,
      isDefault: body.isDefault ?? false,
      description: body.description ?? null,
      expiresAt: body.expiresAt ?? null,
    })

    res.status(201).json({ success: true, data: credential })
  }),
)

router.get(
  '/:id/credentials/:credentialId',
  withRouteErrorHandling('Error fetching integration credential', async (req, res) => {
    const credential = await integrationCredentialDAO.getById(req.params.credentialId)

    if (!credential || credential.integrationId !== req.params.id) {
      res.status(404).json({ error: 'Credential not found' })
      return
    }

    res.json({ success: true, data: credential })
  }),
)

router.put(
  '/:id/credentials/:credentialId',
  withRouteErrorHandling('Error updating integration credential', async (req, res) => {
    const body = req.body as UpdateIntegrationCredentialRequest

    const credential = await integrationCredentialDAO.getById(req.params.credentialId)
    if (!credential || credential.integrationId !== req.params.id) {
      res.status(404).json({ error: 'Credential not found' })
      return
    }

    const updated = await integrationCredentialDAO.update(req.params.credentialId, body)
    res.json({ success: true, data: updated })
  }),
)

router.delete(
  '/:id/credentials/:credentialId',
  withRouteErrorHandling('Error deleting integration credential', async (req, res) => {
    const credential = await integrationCredentialDAO.getById(req.params.credentialId)
    if (!credential || credential.integrationId !== req.params.id) {
      res.status(404).json({ error: 'Credential not found' })
      return
    }

    // Delete the credential (will fail if in use)
    const deleted = await integrationCredentialDAO.delete(req.params.credentialId)
    if (!deleted) {
      res.status(500).json({ error: 'Failed to delete credential' })
      return
    }

    // Also delete the associated secret
    await secretDAO.deleteSecret(credential.secretId)

    res.status(204).send()
  }),
)

export default router
