/**
 * SCM Authentication Types
 */

export interface SCMAuthProvider {
  /**
   * Get the provider name
   */
  getName(): string;

  /**
   * Check if this provider can handle the given repository URL
   */
  canHandle(repoUrl: string): boolean;

  /**
   * Authenticate a repository URL with the appropriate credentials
   * @param repoUrl The original repository URL
   * @returns The authenticated URL with credentials injected
   */
  authenticateUrl(repoUrl: string): string;

  /**
   * Check if authentication credentials are available
   */
  hasCredentials(): boolean;

  /**
   * Get the authentication token for this provider, if available.
   * This is used to authenticate with the SCM API.
   */
  getToken(): string | undefined;
}

export interface SCMAuthConfig {
  token?: string;
  username?: string;
  password?: string;
}
