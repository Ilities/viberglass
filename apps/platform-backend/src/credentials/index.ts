// Core interface
export { CredentialProvider } from './CredentialProvider';

// Factory
export { CredentialProviderFactory } from './CredentialProviderFactory';

// Providers
export { EnvironmentProvider } from './providers/EnvironmentProvider';
export { FileProvider } from './providers/FileProvider';
export { AwsSsmProvider } from './providers/AwsSsmProvider';

// Types
export {
  CredentialConfig,
  ProviderConfig,
  CredentialMetadata,
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
