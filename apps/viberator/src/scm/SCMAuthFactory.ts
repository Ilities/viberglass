import { SCMAuthProvider } from "./types";
import { GithubAuthProvider } from "./providers/GithubAuthProvider";
import { GitlabAuthProvider } from "./providers/GitlabAuthProvider";
import { BitbucketAuthProvider } from "./providers/BitbucketAuthProvider";

/**
 * Factory for creating and managing SCM authentication providers
 */
export class SCMAuthFactory {
  private static providers: SCMAuthProvider[] = [
    new GithubAuthProvider(),
    new GitlabAuthProvider(),
    new BitbucketAuthProvider(),
  ];

  /**
   * Get the appropriate authentication provider for a given repository URL
   * @param repoUrl The repository URL
   * @returns The matching provider or null if none found
   */
  static getProvider(repoUrl: string): SCMAuthProvider | null {
    return (
      this.providers.find((provider) => provider.canHandle(repoUrl)) || null
    );
  }

  /**
   * Authenticate a repository URL using the appropriate provider
   * @param repoUrl The original repository URL
   * @param token Optional explicit token to use instead of environment variable lookup
   * @returns The authenticated URL or the original URL if no provider found
   */
  static authenticateUrl(repoUrl: string, token?: string): string {
    const provider = this.getProvider(repoUrl);

    if (!provider) {
      return repoUrl;
    }

    if (!token && !provider.hasCredentials()) {
      return repoUrl;
    }

    return provider.authenticateUrl(repoUrl, token);
  }

  /**
   * Register a custom SCM authentication provider
   * @param provider The custom provider to register
   */
  static registerProvider(provider: SCMAuthProvider): void {
    this.providers.push(provider);
  }

  /**
   * Get all registered providers
   */
  static getProviders(): SCMAuthProvider[] {
    return [...this.providers];
  }
}
