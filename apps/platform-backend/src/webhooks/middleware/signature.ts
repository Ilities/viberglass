/**
 * Signature verification middleware for webhooks
 *
 * Verifies webhook signatures using timing-safe comparison.
 * Must be applied AFTER rawBodyMiddleware and BEFORE any JSON parsing.
 *
 * @see https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */

import type { Request, Response, NextFunction } from 'express';
import { SignatureValidator } from '../validators';
import type { ExtendedRequest } from './rawBody';

/**
 * Function to retrieve webhook secret for a project
 */
export type SecretGetter = (projectId?: string) => Promise<string>;

/**
 * Configuration for signature middleware
 */
export interface SignatureMiddlewareConfig {
  /** Validator for signature verification */
  validator: SignatureValidator;
  /** Function to retrieve secret for a project */
  getSecret: SecretGetter;
  /** Header name to extract project ID from (optional) */
  projectIdHeader?: string;
  /** Whether to include error details in response (default: false for security) */
  revealErrors?: boolean;
}

/**
 * Express request extended with webhook verification data
 */
export interface WebhookRequest extends ExtendedRequest {
  /** Parsed webhook event data (set after verification) */
  webhookEvent?: {
    provider?: string;
    eventType?: string;
    deduplicationId?: string;
  };
}

/**
 * Create signature verification middleware
 *
 * Usage:
 * 1. Apply rawBodyMiddleware BEFORE this middleware
 * 2. This middleware verifies signature and parses JSON
 * 3. Downstream handlers receive parsed JSON in req.body
 *
 * @param config - Middleware configuration
 * @returns Express middleware function
 *
 * @example
 * ```ts
 * app.use('/webhooks/github',
 *   rawBodyMiddleware(),
 *   createSignatureMiddleware({
 *     validator: SignatureValidatorFactory.forGitHub(),
 *     getSecret: async (projectId) => db.getWebhookSecret(projectId)
 *   })
 * );
 * ```
 */
export function createSignatureMiddleware(config: SignatureMiddlewareConfig) {
  const { validator, getSecret, projectIdHeader, revealErrors = false } = config;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const webhookReq = req as WebhookRequest;

    try {
      // Extract signature from configured header
      const headerName = validator.getHeaderName();
      const signature = req.headers[headerName] as string | string[] | undefined;

      if (!signature) {
        const errorMsg = `Missing signature header: ${headerName}`;
        res.status(401).json({
          error: revealErrors ? errorMsg : 'Unauthorized',
          ...(revealErrors && { requiredHeader: headerName }),
        });
        return;
      }

      // Handle array header values (Express can return array for duplicate headers)
      const signatureValue = Array.isArray(signature) ? signature[0] : signature;

      // Get raw body from request (set by rawBodyMiddleware)
      const rawBody = webhookReq.rawBody;
      if (!rawBody || rawBody.length === 0) {
        const errorMsg = 'Missing raw body for signature verification';
        res.status(400).json({
          error: revealErrors ? errorMsg : 'Bad Request',
        });
        return;
      }

      // Extract project ID for secret lookup
      const projectId = projectIdHeader
        ? (req.headers[projectIdHeader] as string | undefined)
        : undefined;

      // Get webhook secret
      let secret: string;
      try {
        secret = await getSecret(projectId);
      } catch (error) {
        res.status(500).json({
          error: revealErrors ? 'Failed to retrieve webhook secret' : 'Internal Server Error',
        });
        return;
      }

      if (!secret) {
        const errorMsg = 'No webhook secret configured';
        res.status(401).json({
          error: revealErrors ? errorMsg : 'Unauthorized',
        });
        return;
      }

      // Verify signature
      const isValid = validator.verify(rawBody, signatureValue, secret);

      if (!isValid) {
        // Log verification failure (without exposing secrets)
        console.warn(`[Webhook] Signature verification failed for ${headerName}`);

        res.status(401).json({
          error: revealErrors ? 'Invalid signature' : 'Unauthorized',
        });
        return;
      }

      // Signature valid - parse JSON body for downstream handlers
      try {
        const jsonStr = rawBody.toString('utf8');
        req.body = JSON.parse(jsonStr);
      } catch (parseError) {
        const errorMsg = 'Invalid JSON payload after signature verification';
        res.status(400).json({
          error: revealErrors ? errorMsg : 'Bad Request',
        });
        return;
      }

      next();
    } catch (error) {
      console.error('[Webhook] Signature verification error:', error);
      res.status(500).json({
        error: revealErrors
          ? `Signature verification error: ${error instanceof Error ? error.message : 'Unknown error'}`
          : 'Internal Server Error',
      });
    }
  };
}

/**
 * Create middleware that handles multiple signature formats
 *
 * Useful when supporting both SHA-256 and legacy SHA-1 signatures.
 * Tries each validator in order until one succeeds.
 *
 * @param validators - Array of validators to try in order
 * @param getSecret - Function to retrieve secret
 * @returns Express middleware function
 *
 * @example
 * ```ts
 * app.use('/webhooks/github',
 *   rawBodyMiddleware(),
 *   createMultiSignatureMiddleware([
 *     SignatureValidatorFactory.forGitHub(),
 *     SignatureValidatorFactory.forGitHubLegacy()
 *   ], getSecret)
 * );
 * ```
 */
export function createMultiSignatureMiddleware(
  validators: SignatureValidator[],
  getSecret: SecretGetter,
  projectIdHeader?: string
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const webhookReq = req as WebhookRequest;

    try {
      const rawBody = webhookReq.rawBody;
      if (!rawBody || rawBody.length === 0) {
        res.status(400).json({ error: 'Bad Request' });
        return;
      }

      const projectId = projectIdHeader
        ? (req.headers[projectIdHeader] as string | undefined)
        : undefined;

      const secret = await getSecret(projectId);
      if (!secret) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Try each validator
      let isValid = false;
      let usedValidator: SignatureValidator | undefined;

      for (const validator of validators) {
        const headerName = validator.getHeaderName();
        const signature = req.headers[headerName] as string | string[] | undefined;

        if (signature) {
          const signatureValue = Array.isArray(signature) ? signature[0] : signature;
          if (validator.verify(rawBody, signatureValue, secret)) {
            isValid = true;
            usedValidator = validator;
            break;
          }
        }
      }

      if (!isValid) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Parse JSON after successful verification
      try {
        const jsonStr = rawBody.toString('utf8');
        req.body = JSON.parse(jsonStr);
      } catch {
        res.status(400).json({ error: 'Bad Request' });
        return;
      }

      next();
    } catch (error) {
      console.error('[Webhook] Multi-signature verification error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };
}

// Re-export ExtendedRequest from rawBody for convenience
export type { ExtendedRequest } from './rawBody';
