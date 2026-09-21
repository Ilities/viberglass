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
   * Resolve the HTTP basic credentials this provider authenticates with.
   *
   * Deliberately returns the pair rather than a URL with credentials embedded:
   * a token in the remote URL is written to `.git/config`, which lives inside the
   * agent's working directory and is therefore readable by the agent (and by
   * anything the agent has been talked into running).
   *
   * @param token Optional explicit token, used instead of environment lookup
   */
  getCredentials(
    token?: string,
  ): { username: string; password: string } | undefined;

  /**
   * Check if authentication credentials are available
   */
  hasCredentials(): boolean;

  /**
   * Get the authentication token for this provider, if available.
   * This is used to authenticate with the SCM API.
   * @param token Optional explicit token — returned as-is when provided
   */
  getToken(token?: string): string | undefined;
}

export interface SCMAuthConfig {
  token?: string;
  username?: string;
  password?: string;
}
