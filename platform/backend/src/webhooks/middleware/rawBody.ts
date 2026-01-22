/**
 * Raw body parser middleware for webhooks
 *
 * Captures raw request body BEFORE JSON parsing.
 * This is critical for webhook signature verification, which must
 * operate on the raw bytes received from the webhook provider.
 *
 * Must be applied BEFORE signature verification middleware and
 * BEFORE any standard express.json() middleware.
 */

import type { RequestHandler } from 'express';

/**
 * Configuration for raw body middleware
 */
export interface RawBodyMiddlewareConfig {
  /** Content type to parse as raw buffer (default: application/json) */
  type?: string | string[] | RegExp;
  /** Maximum request body size (default: 10mb) */
  limit?: string | number;
}

/**
 * Express request extended with raw body buffer
 */
export interface ExtendedRequest extends Express.Request {
  /** Raw request body as buffer for signature verification */
  rawBody?: Buffer;
}

/**
 * Create raw body parser middleware using express.raw()
 *
 * This captures the raw request body as a Buffer before any JSON parsing
 * can mutate it. Signature verification requires the exact bytes received.
 *
 * @param config - Middleware configuration
 * @returns Express middleware function
 *
 * @example
 * ```ts
 * app.use('/webhooks', rawBodyMiddleware());
 * app.use('/webhooks', createSignatureMiddleware(validator, getSecret));
 * ```
 */
export function rawBodyMiddleware(
  config: RawBodyMiddlewareConfig = {}
): RequestHandler {
  const { type = 'application/json', limit = '10mb' } = config;

  // Use express.raw() to capture body as buffer
  const raw = require('express').raw({ type, limit });

  return raw;
}

/**
 * Wrapper middleware that stores raw body on request for later access
 *
 * This is a convenience wrapper that ensures rawBody is available
 * on the request object for signature verification.
 *
 * @param config - Middleware configuration
 * @returns Express middleware function
 */
export function rawBodyStorageMiddleware(
  config: RawBodyMiddlewareConfig = {}
): RequestHandler {
  const raw = rawBodyMiddleware(config);

  return (req, res, next) => {
    // First, parse raw body
    raw(req, res, (err) => {
      if (err) {
        return next(err);
      }

      // Store raw body on request for signature middleware
      const extendedReq = req as ExtendedRequest;
      extendedReq.rawBody = req.body as Buffer;

      next();
    });
  };
}

/**
 * Combine raw body parsing with JSON parsing after verification
 *
 * Use this when you want raw body capture but still need JSON parsing
 * later in the middleware chain (after signature verification).
 *
 * @param config - Middleware configuration
 * @returns Express middleware function
 */
export function rawBodyWithJsonFallback(
  config: RawBodyMiddlewareConfig = {}
): RequestHandler {
  return (req, res, next) => {
    const extendedReq = req as ExtendedRequest;

    // Capture raw body first
    const raw = rawBodyMiddleware(config);
    raw(req, res, (err) => {
      if (err) {
        return next(err);
      }

      // Store raw body
      extendedReq.rawBody = req.body as Buffer;

      // Try to parse as JSON for convenience
      // Signature middleware will re-parse after verification
      try {
        const jsonStr = extendedReq.rawBody.toString('utf8');
        (req as any).parsedBody = JSON.parse(jsonStr);
      } catch {
        // JSON parsing failed, but raw body is captured
        (req as any).parsedBody = null;
      }

      next();
    });
  };
}
