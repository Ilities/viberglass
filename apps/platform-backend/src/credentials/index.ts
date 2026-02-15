// Core interface
export type { CredentialProvider } from './CredentialProvider';

// Factory
export { CredentialProviderFactory } from './CredentialProviderFactory';

// Providers
export { EnvironmentProvider } from './providers/EnvironmentProvider';
export { FileProvider } from './providers/FileProvider';
export { AwsSsmProvider } from './providers/AwsSsmProvider';

// Types
export type {
  CredentialConfig,
  ProviderConfig,
  CredentialMetadata,
} from './types';

export {
  CredentialNotFoundError,
  CredentialAccessDeniedError,
} from './types';

// Re-export from config for convenience
export {
  loadCredentialConfig,
  createCredentialFactory,
  getCredentialFactory,
  resetCredentialFactory,
} from '../config/credentials';
