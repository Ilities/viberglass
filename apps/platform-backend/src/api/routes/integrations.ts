import express from 'express'
import { requireAuth } from '../middleware/authentication'
import { IntegrationRouteService } from '../services/IntegrationRouteService'

const router = express.Router()
const integrationRouteService = new IntegrationRouteService()

router.use(requireAuth)

// ============================================================================
// Top-level Integration Management
// ============================================================================

router.get('/', integrationRouteService.listIntegrations)
router.post('/', integrationRouteService.createIntegration)
router.get('/:id', integrationRouteService.getIntegration)
router.put('/:id', integrationRouteService.updateIntegration)
router.delete('/:id', integrationRouteService.deleteIntegration)
router.post('/:id/test', integrationRouteService.testIntegration)

// ============================================================================
// Project-Integration Link Management
// ============================================================================

router.get('/project/:projectId', integrationRouteService.getProjectIntegrations)
router.post('/project/:projectId/link', integrationRouteService.linkProjectIntegration)
router.delete('/project/:projectId/link/:integrationId', integrationRouteService.unlinkProjectIntegration)
router.put('/project/:projectId/primary/:integrationId', integrationRouteService.setPrimaryProjectIntegration)

// ============================================================================
// Available Integration Types
// ============================================================================

router.get('/types/available', integrationRouteService.listAvailableTypes)

// ============================================================================
// Webhook configuration endpoints under integrations
// ============================================================================

router.get('/:id/webhooks/inbound', integrationRouteService.listInboundWebhookConfigs)
router.post('/:id/webhooks/inbound', integrationRouteService.createInboundWebhookConfig)
router.put('/:id/webhooks/inbound/:configId', integrationRouteService.updateInboundWebhookConfig)
router.delete('/:id/webhooks/inbound/:configId', integrationRouteService.deleteInboundWebhookConfig)

router.get('/:id/webhooks/outbound', integrationRouteService.listOutboundWebhookConfigs)
router.post('/:id/webhooks/outbound', integrationRouteService.createOutboundWebhookConfig)
router.get('/:id/webhooks/outbound/:configId', integrationRouteService.getOutboundWebhookConfig)
router.put('/:id/webhooks/outbound/:configId', integrationRouteService.updateOutboundWebhookConfig)
router.delete('/:id/webhooks/outbound/:configId', integrationRouteService.deleteOutboundWebhookConfig)

router.get(
  '/:id/webhooks/inbound/:configId/deliveries',
  integrationRouteService.listInboundWebhookDeliveries,
)
router.post(
  '/:id/webhooks/inbound/:configId/deliveries/:deliveryId/retry',
  integrationRouteService.retryInboundWebhookDelivery,
)

export default router
