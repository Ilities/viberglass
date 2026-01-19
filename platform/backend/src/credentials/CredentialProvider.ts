/**
 * Cloud-agnostic credential storage interface
 * All credential providers must implement this contract
 *
 * Following the pattern established in viberator/app/src/scm/types.ts
 * for SCM authentication providers.
 */
export interface CredentialProvider {
  /**
   * Get the provider name for logging and debugging
   */
  readonly name: string;

  /**
   * Get credential value for a tenant
   * @param tenantId - Tenant identifier
   * @param key - Credential key (e.g., "GITHUB_TOKEN", "CLAUDE_API_KEY")
   * @returns Credential value or null if not found
   */
  get(tenantId: string, key: string): Promise<string | null>;

  /**
   * Store credential value for a tenant
   * @param tenantId - Tenant identifier
   * @param key - Credential key
   * @param value - Credential value to store
   */
  put(tenantId: string, key: string, value: string): Promise<void>;

  /**
   * Delete credential for a tenant
   * @param tenantId - Tenant identifier
   * @param key - Credential key
   */
  delete(tenantId: string, key: string): Promise<void>;

  /**
   * Check if provider is properly configured and available
   */
  isAvailable(): Promise<boolean>;

  /**
   * List all credential keys for a tenant (metadata only, no values)
   * Used for validation and debugging
   */
  listKeys?(tenantId: string): Promise<string[]>;
}
