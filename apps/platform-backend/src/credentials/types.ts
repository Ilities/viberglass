/**
 * Credential storage configuration
 */
export interface CredentialConfig {
  /**
   * File provider configuration (local development)
   */
  file?: {
    enabled: boolean;
    filePath: string;
    encryptionKey: string; // hex-encoded 32-byte key
  };

  /**
   * AWS SSM provider configuration (production)
   */
  aws?: {
    enabled: boolean;
    region?: string;
    pathPrefix?: string; // e.g., "/viberator/tenants"
  };

  /**
   * Environment provider configuration (always enabled as fallback)
   */
  environment?: {
    enabled: boolean;
  };
}

/**
 * Provider-specific configuration interface
 * Each provider implements this for its config validation
 */
export interface ProviderConfig {
  validate(): boolean;
}

/**
 * Credential metadata (stored, never logged with values)
 */
export interface CredentialMetadata {
  tenantId: string;
  key: string;
  exists: boolean;
  provider: string;
}

/**
 * Error types for credential operations
 */
export class CredentialNotFoundError extends Error {
  constructor(tenantId: string, key: string) {
    super(`Credential not found: ${tenantId}/${key}`);
    this.name = 'CredentialNotFoundError';
  }
}

export class CredentialAccessDeniedError extends Error {
  constructor(tenantId: string, key: string) {
    super(`Access denied to credential: ${tenantId}/${key}`);
    this.name = 'CredentialAccessDeniedError';
  }
}
