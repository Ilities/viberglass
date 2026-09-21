import { SCMAuthProvider } from "../types";

/**
 * GitHub Authentication Provider
 * Supports authentication via personal access tokens or GitHub App tokens
 */
export class GithubAuthProvider implements SCMAuthProvider {
  getName(): string {
    return "GitHub";
  }

  canHandle(repoUrl: string): boolean {
    return repoUrl.includes("github.com");
  }

  getToken(token?: string): string | undefined {
    if (token) {
      return token;
    }

    console.log(
      "GitHub auth: Checking for GITHUB_TOKEN or GH_TOKEN environment variable...",
    );

    // Primary: exact match for standard token names
    const primaryToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (primaryToken) {
      return primaryToken;
    }

    // Fallback: search for any env var that looks like a GitHub token
    // (contains "github" and "token" in the name)
    const envVars = Object.keys(process.env);
    const githubTokenVar = envVars.find(
      (key) =>
        key.toUpperCase().includes("GITHUB") &&
        key.toUpperCase().includes("TOKEN"),
    );

    if (githubTokenVar) {
      console.log(`GitHub auth: Found token in ${githubTokenVar}`);
      return process.env[githubTokenVar];
    }

    return undefined;
  }

  hasCredentials(): boolean {
    return !!this.getToken();
  }

  getCredentials(
    token?: string,
  ): { username: string; password: string } | undefined {
    const resolvedToken = this.getToken(token);

    if (!resolvedToken) {
      console.warn(
        "GitHub token not found. Set GITHUB_TOKEN or GH_TOKEN environment variable.",
      );
      return undefined;
    }

    // GitHub accepts the token as the basic-auth password for the
    // `x-access-token` user, for both PATs and App installation tokens.
    return { username: "x-access-token", password: resolvedToken };
  }
}
