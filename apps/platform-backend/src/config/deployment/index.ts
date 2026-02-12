/**
 * Deployment secret management for CI/CD and infrastructure configuration
 *
 * This module provides a provider-based pattern for managing deployment-time
 * secrets across all environments (dev, staging, prod).
 *
 * ## Deployment Secrets vs Runtime Tenant Credentials
 *
 * **Deployment secrets** (this module):
 * - Environment-specific values used during deployment
 * - Database URLs, API endpoints, region configuration
 * - Amplify app IDs, ECR repository names
 * - OIDC role ARNs, infrastructure configuration
 * - Path: /viberator/{environment}/{category}/{key}
 *
 * **Runtime tenant credentials** (Phase 1 - ../credentials/):
 * - Multi-tenant data used during application runtime
 * - GitHub tokens, Jira API keys, SCM provider credentials
 * - Per-tenant authentication data
 * - Path: /viberator/tenants/{tenantId}/{key}
 *
 * ## Usage Example
 *
 * ```typescript
 * import { SsmSecretProvider, SecretCategory } from './config/deployment';
 *
 * const provider = new SsmSecretProvider({ region: 'eu-west-1' });
 *
 * // Store database URL for dev environment
 * await provider.putSecret('dev', 'database.url', 'postgresql://...', {
 *   secure: true,
 *   description: 'Dev database connection string'
 * });
 *
 * // Retrieve for deployment
 * const dbUrl = await provider.getSecret('dev', 'database.url');
 * ```
 *
 * @module config/deployment
 */

// Core interface
export {
  SecretProvider,
  SecretOptions,
  SecretCategory,
} from "./SecretProvider.js";

// SSM implementation
export { SsmSecretProvider } from "./SsmSecretProvider.js";
export type { SsmSecretProviderOptions } from "./SsmSecretProvider.js";
