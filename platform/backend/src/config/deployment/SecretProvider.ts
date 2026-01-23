/**
 * Deployment secret management interface
 *
 * This interface defines operations for managing deployment-time secrets
 * (distinct from runtime tenant credentials in ../credentials/).
 *
 * Deployment secrets are environment-specific values used during deployment:
 * - Database URLs, API endpoints
 * - Amplify app IDs, ECR repository names
 * - OIDC role ARNs, region configuration
 *
 * Runtime tenant credentials (Phase 1) are multi-tenant data:
 * - GitHub tokens, Jira API keys
 * - SCM provider credentials
 * - Per-tenant authentication data
 */

/**
 * Secret categories for organizing deployment secrets
 * Used in SSM path hierarchy: /viberator/{environment}/{category}/{key}
 */
export enum SecretCategory {
  /** Database connection credentials and URLs */
  DATABASE = "database",
  /** Frontend configuration (API URLs, CDN URLs) */
  FRONTEND = "frontend",
  /** AWS Amplify app IDs and configuration */
  AMPLIFY = "amplify",
  /** ECS container configuration */
  ECS = "ecs",
  /** Lambda function configuration */
  LAMBDA = "lambda",
}

/**
 * Options for storing secrets
 */
export interface SecretOptions {
  /**
   * Whether to use SecureString (KMS encrypted) or plain String
   * @default true
   */
  secure?: boolean;

  /**
   * Human-readable description for the parameter
   */
  description?: string;

  /**
   * Optional KMS key ID for encryption (overrides default KMS key)
   */
  kmsKeyId?: string;
}

/**
 * Cloud-agnostic deployment secret storage interface
 * All deployment secret providers must implement this contract
 *
 * Following the pattern established in Phase 1 CredentialProvider,
 * but with environment-first API instead of tenant-first.
 */
export interface SecretProvider {
  /**
   * Get the provider name for logging and debugging
   */
  readonly name: string;

  /**
   * Get deployment secret for a specific environment and key
   * @param environment - Environment name (dev, staging, prod)
   * @param key - Secret key (e.g., "database.url", "amplify.appId")
   * @returns Secret value or null if not found
   */
  getSecret(environment: string, key: string): Promise<string | null>;

  /**
   * Store deployment secret for a specific environment
   * @param environment - Environment name (dev, staging, prod)
   * @param key - Secret key (e.g., "database.url", "amplify.appId")
   * @param value - Secret value to store
   * @param options - Optional configuration (secure, description, kmsKeyId)
   */
  putSecret(
    environment: string,
    key: string,
    value: string,
    options?: SecretOptions
  ): Promise<void>;

  /**
   * Delete deployment secret for a specific environment
   * @param environment - Environment name (dev, staging, prod)
   * @param key - Secret key to delete
   */
  deleteSecret(environment: string, key: string): Promise<void>;

  /**
   * Check if provider is properly configured and available
   */
  isAvailable(): Promise<boolean>;
}
