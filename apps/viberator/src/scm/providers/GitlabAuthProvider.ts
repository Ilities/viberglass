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

  getCredentials(
    token?: string,
  ): { username: string; password: string } | undefined {
    const resolvedToken = this.getToken(token);

    if (!resolvedToken) {
      return undefined;
    }

    // GitLab accepts basic auth as oauth2/TOKEN for personal and project access
    // tokens, USERNAME/TOKEN for deploy tokens, gitlab-ci-token/TOKEN in CI.
    return { username: this.getUsername(), password: resolvedToken };
  }
}
