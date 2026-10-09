/**
 * Webhook routes: every integration's deliveries, Slack's events and the
 * webhook status.
 */

import express from 'express';
import { getWebhookService } from '../../webhooks/webhookServiceFactory';
import { createInboundRoutes, createManagementRoutes, createSlackRoutes } from './webhooks/index';

const router = express.Router();

router.use('/', createManagementRoutes(getWebhookService));
router.use('/slack', createSlackRoutes());
router.use('/', createInboundRoutes(getWebhookService));

export default router;
