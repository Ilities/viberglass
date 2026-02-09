/**
 * Webhook routes
 *
 * Main router that combines all provider-specific webhook routes.
 * Refactored to use modular route files for each provider.
 */

import express from 'express';
import { ProviderRegistry } from '../../webhooks/registry';
import { GitHubWebhookProvider } from '../../webhooks/providers/github-provider';
import { JiraWebhookProvider } from '../../webhooks/providers/jira-provider';
import { ShortcutWebhookProvider } from '../../webhooks/providers/shortcut-provider';
import { WebhookConfigDAO } from '../../persistence/webhook/WebhookConfigDAO';
import { WebhookDeliveryDAO } from '../../persistence/webhook/WebhookDeliveryDAO';
import { DeduplicationService } from '../../webhooks/deduplication';
import { WebhookSecretService } from '../../webhooks/WebhookSecretService';
import { TicketDAO } from '../../persistence/ticketing/TicketDAO';
import { JobService } from '../../services/JobService';
import { FeedbackService } from '../../webhooks/FeedbackService';
import { getCredentialFactory } from '../../config/credentials';
import { WebhookService } from '../../webhooks/WebhookService';
import {
  createGitHubRoutes,
  createJiraRoutes,
  createShortcutRoutes,
  createCustomRoutes,
  createManagementRoutes,
} from './webhooks/index';

const router = express.Router();

/**
 * Initialize webhook services
 * All services are created lazily on first request to allow for proper dependency injection
 */
let webhookService: WebhookService | null = null;

/**
 * Get or initialize webhook service
 */
function getWebhookService(): WebhookService {
  if (!webhookService) {
    // Initialize provider registry
    const registry = new ProviderRegistry();

    // Register GitHub provider
    const githubProvider = new GitHubWebhookProvider({
      type: 'github',
      secretLocation: 'database',
      algorithm: 'sha256',
      allowedEvents: ['issues', 'issue_comment'],
    });
    registry.register(githubProvider);

    // Register Jira provider
    const jiraProvider = new JiraWebhookProvider({
      type: 'jira',
      secretLocation: 'database',
      algorithm: 'sha256',
      allowedEvents: ['issue_created', 'issue_updated', 'comment_created'],
    });
    registry.register(jiraProvider);

    // Register Shortcut provider
    const shortcutProvider = new ShortcutWebhookProvider({
      type: 'shortcut',
      secretLocation: 'database',
      algorithm: 'sha256',
      allowedEvents: ['story_created', 'story_updated', 'comment_created'],
    });
    registry.register(shortcutProvider);

    // Initialize DAOs
    const configDAO = new WebhookConfigDAO();
    const deliveryDAO = new WebhookDeliveryDAO();
    const deduplication = new DeduplicationService(deliveryDAO);
    const credentialProvider = getCredentialFactory();
    const secretService = new WebhookSecretService(credentialProvider);
    const ticketDAO = new TicketDAO();

    // Initialize services
    const feedbackService = new FeedbackService(
      registry,
      configDAO,
      secretService,
    );
    const jobService = new JobService(feedbackService);

    // Initialize webhook service
    webhookService = new WebhookService(
      registry,
      configDAO,
      deliveryDAO,
      deduplication,
      secretService,
      ticketDAO,
      jobService,
      {
        enableAutoExecute: true,
        defaultTenantId: process.env.DEFAULT_TENANT_ID || 'default',
      }
    );
  }

  return webhookService;
}

// Mount provider-specific routes
router.use('/github', createGitHubRoutes(getWebhookService));
router.use('/jira', createJiraRoutes(getWebhookService));
router.use('/shortcut', createShortcutRoutes(getWebhookService));
router.use('/custom', createCustomRoutes());
router.use('/', createManagementRoutes(getWebhookService));

export default router;
