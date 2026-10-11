/**
 * Webhook routes: every integration's deliveries, chat services' events and the
 * webhook status.
 */

import express from 'express';
import { getWebhookService } from '../../webhooks/webhookServiceFactory';
import { createChatRoutes, createInboundRoutes, createManagementRoutes } from './webhooks/index';

const router = express.Router();

router.use('/', createManagementRoutes(getWebhookService));
router.use('/', createChatRoutes());
router.use('/', createInboundRoutes(getWebhookService));

export default router;
