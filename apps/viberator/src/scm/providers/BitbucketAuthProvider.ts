import { SCMAuthProvider } from "../types";

/**
 * Bitbucket Authentication Provider
 * Supports authentication via app passwords or access tokens
 */
export class BitbucketAuthProvider implements SCMAuthProvider {
  getName(): string {
    return "Bitbucket";
  }

  canHandle(repoUrl: string): boolean {
    return repoUrl.includes("bitbucket.org") || repoUrl.includes("bitbucket.");
  }

  getToken(): string | undefined {
    return process.env.BITBUCKET_TOKEN || process.env.BITBUCKET_APP_PASSWORD;
  }

  private getUsername(): string {
    return process.env.BITBUCKET_USERNAME || "x-token-auth";
  }

  hasCredentials(): boolean {
    return !!this.getToken();
  }

  authenticateUrl(repoUrl: string): string {
    const token = this.getToken();

    if (!token) {
      return repoUrl;
    }

    try {
      const url = new URL(repoUrl);

      // Bitbucket supports:
      // 1. App Password: https://USERNAME:APP_PASSWORD@bitbucket.org/owner/repo.git
      // 2. Access Token: https://x-token-auth:TOKEN@bitbucket.org/owner/repo.git
      url.username = this.getUsername();
      url.password = token;

      return url.toString();
    } catch (error) {
      // If URL parsing fails, return original URL
      return repoUrl;
    }
  }
}
