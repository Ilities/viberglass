import { CredentialProviderFactory } from '../credentials/CredentialProviderFactory';

/**
 * Credential system configuration
 *
 * Supports all deployment scenarios:
 * - Local development: FileProvider with CREDENTIALS_ENCRYPTION_KEY
 * - Staging/Prod: AwsSsmProvider with AWS_REGION and SSM_PARAMETER_PREFIX
 * - Testing: EnvironmentProvider for test credentials
 *
 * Environment variables:
 * - CREDENTIALS_FILE_PATH: Path to encrypted file (default: .credentials.json)
 * - CREDENTIALS_ENCRYPTION_KEY: 64-char hex string for file encryption
 * - AWS_REGION: AWS region for SSM (default: us-east-1)
 * - SSM_PARAMETER_PREFIX: SSM path prefix (default: /viberator/tenants)
 * - ENABLE_FILE_PROVIDER: Enable file provider (default: true if key set)
 * - ENABLE_AWS_PROVIDER: Enable AWS provider (default: true if region set)
 */
export interface CredentialConfig {
  file?: {
    enabled: boolean;
    filePath?: string;
    encryptionKey?: string;
  };
  aws?: {
    enabled: boolean;
    region?: string;
    pathPrefix?: string;
  };
  environment?: {
    enabled: boolean;
  };
}

/**
 * Load credential configuration from environment
 */
export function loadCredentialConfig(): CredentialConfig {
  const config: CredentialConfig = {
    environment: { enabled: true }, // Always enable as fallback
  };

  // File provider configuration
  const hasEncryptionKey = !!process.env.CREDENTIALS_ENCRYPTION_KEY;
  const enableFile = process.env.ENABLE_FILE_PROVIDER !== 'false' && hasEncryptionKey;

  if (enableFile) {
    config.file = {
      enabled: true,
      filePath: process.env.CREDENTIALS_FILE_PATH,
      encryptionKey: process.env.CREDENTIALS_ENCRYPTION_KEY,
    };
  }

  // AWS SSM provider configuration
  const hasAwsRegion = !!process.env.AWS_REGION;
  const enableAws = process.env.ENABLE_AWS_PROVIDER !== 'false' && hasAwsRegion;

  if (enableAws) {
    config.aws = {
      enabled: true,
      region: process.env.AWS_REGION,
      pathPrefix: process.env.SSM_PARAMETER_PREFIX,
    };
  }

  return config;
}

/**
 * Create a credential factory with environment-based configuration
 */
export function createCredentialFactory(): CredentialProviderFactory {
  const config = loadCredentialConfig();
  return new CredentialProviderFactory(config);
}

/**
 * Singleton instance for application-wide use
 */
let factoryInstance: CredentialProviderFactory | null = null;

/**
 * Get or create the singleton credential factory
 */
export function getCredentialFactory(): CredentialProviderFactory {
  if (!factoryInstance) {
    factoryInstance = createCredentialFactory();
  }
  return factoryInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetCredentialFactory(): void {
  factoryInstance = null;
}
