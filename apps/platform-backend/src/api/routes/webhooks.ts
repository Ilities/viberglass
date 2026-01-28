import express, { Request, Response } from 'express';
import { WebhookService } from '../../webhooks/WebhookService';
import { FeedbackService } from '../../webhooks/FeedbackService';
import { ProviderRegistry } from '../../webhooks/registry';
import { GitHubWebhookProvider } from '../../webhooks/providers/github-provider';
import { WebhookConfigDAO, type WebhookConfig } from '../../persistence/webhook/WebhookConfigDAO';
import { WebhookDeliveryDAO } from '../../persistence/webhook/WebhookDeliveryDAO';
import { DeduplicationService } from '../../webhooks/deduplication';
import { WebhookSecretService } from '../../webhooks/WebhookSecretService';
import { rawBodyStorageMiddleware } from '../../webhooks/middleware/rawBody';
import { createSignatureMiddleware } from '../../webhooks/middleware/signature';
import { SignatureValidatorFactory } from '../../webhooks/validators';
import { TicketDAO } from '../../persistence/ticketing/TicketDAO';
import { JobService } from '../../services/JobService';
import { getCredentialFactory } from '../../config/credentials';

const router = express.Router();

/**
 * Initialize webhook services
 * All services are created lazily on first request to allow for proper dependency injection
 */

let webhookService: WebhookService | null = null;
let feedbackService: FeedbackService | null = null;

const serializeWebhookConfig = (config: WebhookConfig) => ({
  id: config.id,
  projectId: config.projectId,
  provider: config.provider,
  providerProjectId: config.providerProjectId,
  secretLocation: config.secretLocation,
  secretPath: config.secretPath,
  webhookSecretEncrypted: config.webhookSecretEncrypted,
  apiTokenEncrypted: config.apiTokenEncrypted,
  allowedEvents: config.allowedEvents,
  autoExecute: config.autoExecute,
  botUsername: config.botUsername,
  labelMappings: config.labelMappings,
  active: config.active,
  createdAt: config.createdAt,
  updatedAt: config.updatedAt,
});

/**
 * Get or initialize webhook service
 */
function getWebhookService(): WebhookService {
  if (!webhookService) {
    // Initialize provider registry
    const registry = new ProviderRegistry();

    // Register GitHub provider (config will be loaded per-request)
    const githubProvider = new GitHubWebhookProvider({
      type: 'github',
      secretLocation: 'database',
      algorithm: 'sha256',
      allowedEvents: ['issues', 'issue_comment'],
    });
    registry.register(githubProvider);

    // Initialize DAOs
    const configDAO = new WebhookConfigDAO();
    const deliveryDAO = new WebhookDeliveryDAO();
    const deduplication = new DeduplicationService(deliveryDAO);
    const credentialProvider = getCredentialFactory();
    const secretService = new WebhookSecretService(credentialProvider);
    const ticketDAO = new TicketDAO();

    // Initialize JobService without feedback initially (will be set later)
    const jobService = new JobService();

    // Initialize services
    feedbackService = new FeedbackService(registry, configDAO, secretService);

    // Update JobService with feedback service
    jobService.constructor(feedbackService);

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

/**
 * Get or initialize feedback service
 */
function getFeedbackService(): FeedbackService {
  if (!feedbackService) {
    // Ensure webhook service is initialized first
    getWebhookService();
  }
  return feedbackService as FeedbackService;
}

/**
 * Create secret getter for signature middleware
 * Looks up webhook secret based on repository from request
 */
async function getSecretForRequest(headers: Record<string, string>): Promise<string> {
  const configDAO = new WebhookConfigDAO();
  const secretService = new WebhookSecretService(getCredentialFactory());

  // Extract repository from headers or body
  // For GitHub, we need to parse the body to get repository info
  // For now, use a default or look up by provider project
  const repo = headers['x-github-repo'] as string | undefined;

  if (repo) {
    const config = await configDAO.getActiveConfigByProviderProject('github', repo);
    if (config) {
      const providerConfig = {
        type: config.provider,
        secretLocation: config.secretLocation,
        algorithm: 'sha256' as const,
        allowedEvents: config.allowedEvents,
        webhookSecret: config.webhookSecretEncrypted || undefined,
        apiToken: config.apiTokenEncrypted || undefined,
        providerProjectId: config.providerProjectId || undefined,
      };
      return await secretService.getSecret(providerConfig);
    }
  }

  // Fallback to environment variable
  return process.env.GITHUB_WEBHOOK_SECRET || '';
}

// ============================================================================
// GitHub Webhook Routes
// ============================================================================

/**
 * POST /api/webhooks/github
 *
 * GitHub webhook endpoint for receiving events from GitHub.
 * Handles issues and issue_comment events.
 *
 * Middleware chain:
 * 1. Raw body parser (captures bytes for signature verification)
 * 2. Signature verification (validates HMAC-SHA256 signature)
 * 3. Webhook processing (via WebhookService)
 */
router.post(
  '/github',
  rawBodyStorageMiddleware(),
  createSignatureMiddleware({
    validator: SignatureValidatorFactory.forGitHub(),
    getSecret: async () => {
      // Default secret for now - per-request secret lookup in handler
      return process.env.GITHUB_WEBHOOK_SECRET || '';
    },
  }),
  async (req: Request, res: Response) => {
    try {
      const service = getWebhookService();

      // Cast rawBody from request
      const rawBody = (req as any).rawBody as Buffer;

      const result = await service.processWebhook(
        req.headers as Record<string, string>,
        req.body,
        rawBody,
        req.tenantId
      );

      // Return appropriate response based on result status
      switch (result.status) {
        case 'processed':
          return res.status(200).json({
            message: 'Webhook processed successfully',
            ticketId: result.ticketId,
            jobId: result.jobId,
          });

        case 'ignored':
          return res.status(200).json({
            message: 'Webhook ignored',
            reason: result.reason,
          });

        case 'rejected':
          return res.status(401).json({
            error: 'Webhook rejected',
            reason: result.reason,
          });

        case 'duplicate':
          return res.status(200).json({
            message: 'Duplicate delivery',
            existingId: result.existingId,
          });

        case 'failed':
          return res.status(500).json({
            error: 'Webhook processing failed',
            reason: result.reason,
          });

        default:
          return res.status(500).json({
            error: 'Unknown webhook status',
          });
      }
    } catch (error) {
      console.error('Error processing GitHub webhook:', error);
      return res.status(500).json({
        error: 'Failed to process webhook',
      });
    }
  }
);

/**
 * POST /api/webhooks/jira
 *
 * Jira webhook endpoint (placeholder for future implementation)
 */
router.post('/jira', (req: Request, res: Response) => {
  res.status(501).json({
    error: 'Jira webhook support not yet implemented',
  });
});

// ============================================================================
// Webhook Status and Management Routes
// ============================================================================

/**
 * GET /api/webhooks/status
 *
 * Get webhook processing status and statistics
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const service = getWebhookService();
    const configDAO = new WebhookConfigDAO();
    const deliveryDAO = new WebhookDeliveryDAO();

    // Get failed deliveries count
    const failedDeliveries = await service.getFailedDeliveries(100);

    // Get delivery stats by provider
    const githubStats = await deliveryDAO.getDeliveryStatsByProvider('github');

    // Get active configurations
    const configs = await configDAO.listActiveConfigs(10);

    res.json({
      status: 'operational',
      providers: {
        github: {
          configured: configs.some(c => c.provider === 'github'),
          stats: githubStats,
        },
        jira: {
          configured: configs.some(c => c.provider === 'jira'),
          stats: null,
        },
      },
      failedDeliveries: {
        count: failedDeliveries.length,
        recent: failedDeliveries.slice(0, 10).map(d => ({
          id: d.id,
          deliveryId: d.deliveryId,
          eventType: d.eventType,
          errorMessage: d.errorMessage,
          createdAt: d.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('Error getting webhook status:', error);
    res.status(500).json({
      error: 'Failed to get webhook status',
    });
  }
});

/**
 * POST /api/webhooks/:deliveryId/retry
 *
 * Retry a failed webhook delivery
 */
router.post('/deliveries/:deliveryId/retry', async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const service = getWebhookService();

    const result = await service.retryDelivery(deliveryId);

    switch (result.status) {
      case 'processed':
        return res.status(200).json({
          message: 'Webhook retried successfully',
          ticketId: result.ticketId,
          jobId: result.jobId,
        });

      case 'duplicate':
        return res.status(200).json({
          message: 'Delivery already succeeded',
        });

      case 'failed':
        return res.status(400).json({
          error: 'Retry failed',
          reason: result.reason,
        });

      default:
        return res.status(500).json({
          error: 'Unknown retry status',
        });
    }
  } catch (error) {
    console.error('Error retrying webhook delivery:', error);
    res.status(500).json({
      error: 'Failed to retry webhook',
    });
  }
});

/**
 * GET /api/webhooks/configs
 *
 * List all webhook configurations
 */
router.get('/configs', async (req: Request, res: Response) => {
  try {
    const configDAO = new WebhookConfigDAO();
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const projectId = req.query.projectId as string | undefined;

    const configs = projectId
      ? await configDAO.listConfigsByProject(projectId, limit, offset)
      : await configDAO.listActiveConfigs(limit, offset);

    res.json({
      configs: configs.map(serializeWebhookConfig),
      count: configs.length,
    });
  } catch (error) {
    console.error('Error listing webhook configs:', error);
    res.status(500).json({
      error: 'Failed to list webhook configurations',
    });
  }
});

/**
 * POST /api/webhooks/configs
 *
 * Create a new webhook configuration
 */
router.post('/configs', async (req: Request, res: Response) => {
  try {
    const configDAO = new WebhookConfigDAO();

    const config = await configDAO.createConfig({
      provider: req.body.provider,
      providerProjectId: req.body.providerProjectId,
      projectId: req.body.projectId || req.tenantId || null,
      secretLocation: req.body.secretLocation || 'database',
      secretPath: req.body.secretPath || null,
      webhookSecretEncrypted: req.body.webhookSecret,
      apiTokenEncrypted: req.body.apiToken,
      allowedEvents: req.body.allowedEvents || ['issues', 'issue_comment'],
      autoExecute: req.body.autoExecute || false,
      botUsername: req.body.botUsername || null,
      labelMappings: req.body.labelMappings || {},
      active: req.body.active !== false,
    });

    res.status(201).json(serializeWebhookConfig(config));
  } catch (error) {
    console.error('Error creating webhook config:', error);
    res.status(500).json({
      error: 'Failed to create webhook configuration',
    });
  }
});

/**
 * PUT /api/webhooks/configs/:id
 *
 * Update an existing webhook configuration
 */
router.put('/configs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const configDAO = new WebhookConfigDAO();

    const existing = await configDAO.getConfigById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Webhook configuration not found' });
    }

    await configDAO.updateConfig(id, {
      projectId: req.body.projectId,
      provider: req.body.provider,
      providerProjectId: req.body.providerProjectId,
      secretLocation: req.body.secretLocation,
      secretPath: req.body.secretPath,
      webhookSecretEncrypted: req.body.webhookSecret,
      apiTokenEncrypted: req.body.apiToken,
      allowedEvents: req.body.allowedEvents,
      autoExecute: req.body.autoExecute,
      botUsername: req.body.botUsername,
      labelMappings: req.body.labelMappings,
      active: req.body.active,
    });

    const updated = await configDAO.getConfigById(id);
    if (!updated) {
      return res.status(404).json({ error: 'Webhook configuration not found' });
    }

    res.json(serializeWebhookConfig(updated));
  } catch (error) {
    console.error('Error updating webhook config:', error);
    res.status(500).json({
      error: 'Failed to update webhook configuration',
    });
  }
});

/**
 * POST /api/webhooks/configs/:id/test
 *
 * Validate a webhook configuration
 */
router.post('/configs/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const configDAO = new WebhookConfigDAO();

    const config = await configDAO.getConfigById(id);
    if (!config) {
      return res.status(404).json({ success: false, message: 'Configuration not found' });
    }

    if (config.provider !== 'github') {
      return res.json({
        success: false,
        message: `Provider ${config.provider} is not supported for testing yet`,
      });
    }

    const providerConfig = {
      type: config.provider,
      secretLocation: config.secretLocation,
      secretPath: config.secretPath || undefined,
      algorithm: 'sha256' as const,
      allowedEvents: config.allowedEvents,
      webhookSecret: config.webhookSecretEncrypted || undefined,
      apiToken: config.apiTokenEncrypted || undefined,
      providerProjectId: config.providerProjectId || undefined,
    };

    const provider = new GitHubWebhookProvider(providerConfig);
    const isValid = provider.validateConfig(providerConfig);

    if (!isValid) {
      return res.json({
        success: false,
        message: 'Configuration is missing required fields',
      });
    }

    return res.json({
      success: true,
      message: 'Configuration looks valid',
    });
  } catch (error) {
    console.error('Error testing webhook config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test webhook configuration',
    });
  }
});

/**
 * DELETE /api/webhooks/configs/:id
 *
 * Delete a webhook configuration
 */
router.delete('/configs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const configDAO = new WebhookConfigDAO();

    const deleted = await configDAO.deleteConfig(id);

    if (!deleted) {
      return res.status(404).json({
        error: 'Webhook configuration not found',
      });
    }

    res.json({
      message: 'Webhook configuration deleted',
      id,
    });
  } catch (error) {
    console.error('Error deleting webhook config:', error);
    res.status(500).json({
      error: 'Failed to delete webhook configuration',
    });
  }
});

/**
 * GET /api/webhooks/deliveries
 *
 * List failed webhook deliveries
 */
router.get('/deliveries', async (req: Request, res: Response) => {
  try {
    const service = getWebhookService();
    const limit = parseInt(req.query.limit as string) || 50;

    const deliveries = await service.getFailedDeliveries(limit);

    res.json({
      deliveries: deliveries.map(d => ({
        id: d.id,
        deliveryId: d.deliveryId,
        provider: d.provider,
        eventType: d.eventType,
        status: d.status,
        errorMessage: d.errorMessage,
        ticketId: d.ticketId,
        createdAt: d.createdAt,
        processedAt: d.processedAt,
      })),
      count: deliveries.length,
    });
  } catch (error) {
    console.error('Error listing webhook deliveries:', error);
    res.status(500).json({
      error: 'Failed to list webhook deliveries',
    });
  }
});

// ============================================================================
// Legacy endpoints (deprecated, will be removed)
// ============================================================================

/**
 * POST /api/webhooks/trigger-autofix
 *
 * @deprecated Use webhook-based auto-triggering instead
 */
router.post('/trigger-autofix', async (req: Request, res: Response) => {
  res.status(200).json({
    message: 'Auto-fix triggered',
    note: 'This endpoint is deprecated. Use GitHub webhooks with bot mentions instead.',
  });
});

export default router;
