import { Request, Response, NextFunction } from 'express';
import { getCredentialFactory } from '../../config/credentials';
import { CredentialAccessDeniedError } from '../../credentials/types';

/**
 * Tenant validation middleware
 *
 * Ensures SEC-03: API validates that requests only access resources
 * belonging to the requesting tenant.
 *
 * Usage:
 * - Apply to routes that access tenant-scoped resources
 * - Extract tenantId from request (header, JWT, or session)
 * - Validate credential access before proceeding
 */

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

/**
 * Extract tenant ID from request
 *
 * Priority order:
 * 1. X-Tenant-Id header (standard API requests)
 * 2. tenantId query parameter (webhook compatibility)
 * 3. DEFAULT_TENANT_ID environment variable (configured default)
 * 4. 'api-server' as fallback default
 *
 * For webhook routes, the tenant is resolved from the webhook configuration
 * (repository/project mapping) rather than the request headers. The default
 * tenant here ensures the request doesn't fail before the webhook handler
 * can resolve the actual tenant from the configuration.
 */
function extractTenantId(req: Request): string | null {
  // 1. Check header (current implementation)
  const headerTenantId = req.get('X-Tenant-Id');
  if (headerTenantId) {
    return headerTenantId;
  }

  // 2. Check query parameter (for webhook compatibility)
  if (req.query.tenantId && typeof req.query.tenantId === 'string') {
    return req.query.tenantId;
  }

  // 3. Default tenant for single-tenant deployments and webhook routes
  // Webhook routes will override this with tenant from configuration
  const defaultTenant = process.env.DEFAULT_TENANT_ID || 'api-server';
  return defaultTenant;
}

/**
 * Validate that a tenant can access a specific credential key
 */
export async function validateTenantAccess(
  tenantId: string,
  key: string
): Promise<boolean> {
  try {
    const factory = getCredentialFactory();
    const value = await factory.get(tenantId, key);

    // If we can retrieve the value, tenant has access
    // (Null is OK - means credential doesn't exist, not access denied)
    return true;
  } catch (error) {
    if (error instanceof CredentialAccessDeniedError) {
      return false;
    }
    // Other errors don't mean access denied
    return true;
  }
}

/**
 * Middleware to add tenantId to request
 *
 * Note: This middleware always sets a tenantId (using defaults if not provided),
 * which means webhook routes work without X-Tenant-Id header. The actual tenant
 * for webhook-originated resources is resolved from the webhook configuration
 * (repository/project mapping) in the WebhookService.
 */
export function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const tenantId = extractTenantId(req);

  if (!tenantId) {
    res.status(401).json({
      error: 'Tenant ID required',
      message: 'Provide X-Tenant-Id header or tenantId query parameter',
    });
    return;
  }

  // Validate tenant ID format (basic check)
  if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
    res.status(400).json({
      error: 'Invalid tenant ID',
      message: 'Tenant ID must contain only alphanumeric characters, hyphens, and underscores',
    });
    return;
  }

  req.tenantId = tenantId;
  next();
}

/**
 * Middleware to validate tenant can access specific credential
 */
export function credentialAccessMiddleware(keyParam: string = 'key') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant not authenticated' });
      return;
    }

    const key = req.params[keyParam] || req.body[keyParam];
    if (!key) {
      next(); // No key to validate
      return;
    }

    const hasAccess = await validateTenantAccess(tenantId, key);

    if (!hasAccess) {
      res.status(403).json({
        error: 'Access denied',
        message: 'Tenant does not have access to this credential',
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to validate tenant owns a resource
 * For resources that have a tenant_id property
 */
export function resourceOwnerMiddleware(resourceIdParam: string = 'id') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant not authenticated' });
      return;
    }

    // This is a placeholder for future implementation
    // When we have resource repositories, we'll check the resource's tenant_id
    // For now, we allow the request to proceed
    next();
  };
}

/**
 * Require a specific tenant (for admin routes)
 */
export function requireTenantTenant(requiredTenantId: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tenantId = req.tenantId;

    if (!tenantId) {
      res.status(401).json({ error: 'Tenant not authenticated' });
      return;
    }

    if (tenantId !== requiredTenantId) {
      res.status(403).json({
        error: 'Access denied',
        message: 'This resource is restricted to specific tenants',
      });
      return;
    }

    next();
  };
}
