import { SCMAuthProvider } from "../types";

/**
 * GitLab Authentication Provider
 * Supports authentication via personal access tokens, project access tokens, or deploy tokens
 */
export class GitlabAuthProvider implements SCMAuthProvider {
  getName(): string {
    return "GitLab";
  }

  canHandle(repoUrl: string): boolean {
    return repoUrl.includes("gitlab.com") || repoUrl.includes("gitlab.");
  }

  getToken(token?: string): string | undefined {
    if (token) {
      return token;
    }

    // Primary: exact match for standard token names
    const primaryToken = process.env.GITLAB_TOKEN || process.env.CI_JOB_TOKEN;
    if (primaryToken) {
      return primaryToken;
    }

    // Fallback: search for any env var that looks like a GitLab token
    const envVars = Object.keys(process.env);
    const gitlabTokenVar = envVars.find(
      (key) =>
        key.toUpperCase().includes("GITLAB") &&
        (key.toUpperCase().includes("TOKEN") || key.toUpperCase().includes("PASSWORD")),
    );

    if (gitlabTokenVar) {
      console.log(`GitLab auth: Found token in ${gitlabTokenVar}`);
      return process.env[gitlabTokenVar];
    }

    return undefined;
  }

  private getUsername(): string {
    return process.env.GITLAB_USERNAME || "oauth2";
  }

  hasCredentials(): boolean {
    return !!this.getToken();
  }

  authenticateUrl(repoUrl: string, token?: string): string {
    const resolvedToken = this.getToken(token);

    if (!resolvedToken) {
      return repoUrl;
    }

    try {
      const url = new URL(repoUrl);

      // GitLab supports multiple authentication formats:
      // 1. Personal Access Token: https://oauth2:TOKEN@gitlab.com/owner/repo.git
      // 2. Deploy Token: https://USERNAME:TOKEN@gitlab.com/owner/repo.git
      // 3. CI Job Token: https://gitlab-ci-token:TOKEN@gitlab.com/owner/repo.git
      url.username = this.getUsername();
      url.password = resolvedToken;

      return url.toString();
    } catch (error) {
      // If URL parsing fails, return original URL
      return repoUrl;
    }
  }
}
