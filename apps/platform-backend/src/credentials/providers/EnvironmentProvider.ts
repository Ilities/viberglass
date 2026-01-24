import { CredentialProvider } from '../CredentialProvider';

/**
 * Environment variable credential provider
 * Reads credentials from process.env with key transformation
 *
 * Key transformation: "github_token" -> "GITHUB_TOKEN"
 * This allows consistent naming across providers while respecting
 * environment variable naming conventions.
 */
export class EnvironmentProvider implements CredentialProvider {
  readonly name = 'EnvironmentProvider';

  /**
   * Transform credential key to environment variable name
   * Converts lowercase_with_underscores to UPPERCASE_WITH_UNDERSCORES
   */
  private keyToEnvKey(key: string): string {
    return key.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  }

  async get(tenantId: string, key: string): Promise<string | null> {
    // Environment provider doesn't use tenantId for isolation
    // All tenants share the same environment space
    const envKey = this.keyToEnvKey(key);
    const value = process.env[envKey];

    if (value === undefined || value === '') {
      return null;
    }

    return value;
  }

  async put(_tenantId: string, _key: string, _value: string): Promise<void> {
    // Environment is read-only at runtime
    throw new Error('EnvironmentProvider is read-only: cannot set environment variables at runtime');
  }

  async delete(_tenantId: string, _key: string): Promise<void> {
    // Environment is read-only at runtime
    throw new Error('EnvironmentProvider is read-only: cannot delete environment variables at runtime');
  }

  async isAvailable(): Promise<boolean> {
    // Environment provider is always available (no external dependencies)
    return true;
  }

  async listKeys(_tenantId: string): Promise<string[]> {
    // Return all environment variables that look like credentials
    const credentialKeys = Object.keys(process.env).filter(key => {
      const upperKey = key.toUpperCase();
      return upperKey.includes('TOKEN') ||
             upperKey.includes('API_KEY') ||
             upperKey.includes('PASSWORD') ||
             upperKey.includes('SECRET') ||
             upperKey.includes('CREDENTIAL');
    });

    // Convert back to our key format (lowercase)
    return credentialKeys.map(key => key.toLowerCase());
  }
}
