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

  getToken(): string | undefined {
    return process.env.GITLAB_TOKEN || process.env.CI_JOB_TOKEN;
  }

  private getUsername(): string {
    return process.env.GITLAB_USERNAME || "oauth2";
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

      // GitLab supports multiple authentication formats:
      // 1. Personal Access Token: https://oauth2:TOKEN@gitlab.com/owner/repo.git
      // 2. Deploy Token: https://USERNAME:TOKEN@gitlab.com/owner/repo.git
      // 3. CI Job Token: https://gitlab-ci-token:TOKEN@gitlab.com/owner/repo.git
      url.username = this.getUsername();
      url.password = token;

      return url.toString();
    } catch (error) {
      // If URL parsing fails, return original URL
      return repoUrl;
    }
  }
}
