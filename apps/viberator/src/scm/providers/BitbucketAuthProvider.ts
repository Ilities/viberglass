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

  getToken(token?: string): string | undefined {
    if (token) {
      return token;
    }

    // Primary: exact match for standard token names
    const primaryToken = process.env.BITBUCKET_TOKEN || process.env.BITBUCKET_APP_PASSWORD;
    if (primaryToken) {
      return primaryToken;
    }

    // Fallback: search for any env var that looks like a Bitbucket token
    const envVars = Object.keys(process.env);
    const bitbucketTokenVar = envVars.find(
      (key) =>
        key.toUpperCase().includes("BITBUCKET") &&
        (key.toUpperCase().includes("TOKEN") || key.toUpperCase().includes("PASSWORD")),
    );

    if (bitbucketTokenVar) {
      console.log(`Bitbucket auth: Found token in ${bitbucketTokenVar}`);
      return process.env[bitbucketTokenVar];
    }

    return undefined;
  }

  private getUsername(): string {
    return process.env.BITBUCKET_USERNAME || "x-token-auth";
  }

  hasCredentials(): boolean {
    return !!this.getToken();
  }

  getCredentials(
    token?: string,
  ): { username: string; password: string } | undefined {
    const resolvedToken = this.getToken(token);

    if (!resolvedToken) {
      return undefined;
    }

    // Bitbucket accepts USERNAME/APP_PASSWORD or x-token-auth/TOKEN as basic auth.
    return { username: this.getUsername(), password: resolvedToken };
  }
}
