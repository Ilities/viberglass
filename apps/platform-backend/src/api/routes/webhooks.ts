/**
 * Webhook routes
 *
 * Main router that combines all provider-specific webhook routes.
 * Refactored to use modular route files for each provider.
 */

import express from 'express';
import { getWebhookService } from '../../webhooks/webhookServiceFactory';
import {
  createGitHubRoutes,
  createJiraRoutes,
  createShortcutRoutes,
  createCustomRoutes,
  createManagementRoutes,
} from './webhooks/index';

const router = express.Router();

// Mount provider-specific routes
router.use('/github', createGitHubRoutes(getWebhookService));
router.use('/jira', createJiraRoutes(getWebhookService));
router.use('/shortcut', createShortcutRoutes(getWebhookService));
router.use('/custom', createCustomRoutes());
router.use('/', createManagementRoutes(getWebhookService));

export default router;
