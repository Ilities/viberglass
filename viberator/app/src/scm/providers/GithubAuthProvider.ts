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

  getToken(): string | undefined {
    console.log(
      "GitHub auth: Checking for GITHUB_TOKEN or GH_TOKEN environment variable...",
    );
    return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  }

  hasCredentials(): boolean {
    return !!this.getToken();
  }

  authenticateUrl(repoUrl: string): string {
    const token = this.getToken();

    if (!token) {
      console.warn(
        "GitHub token not found. Set GITHUB_TOKEN or GH_TOKEN environment variable.",
      );
      console.warn(
        "Available env vars:",
        Object.keys(process.env).filter(
          (k) => k.includes("GIT") || k.includes("TOKEN"),
        ),
      );
      return repoUrl;
    }

    try {
      // Convert SSH URLs to HTTPS format
      let httpsUrl = repoUrl;
      if (repoUrl.startsWith("git@github.com:")) {
        httpsUrl = repoUrl.replace("git@github.com:", "https://github.com/");
      }

      const url = new URL(httpsUrl);

      // GitHub supports token authentication via:
      // https://x-access-token:TOKEN@github.com/owner/repo.git
      url.username = "x-access-token";
      url.password = token;

      const authenticatedUrl = url.toString();
      console.log("GitHub auth: URL authenticated successfully");
      return authenticatedUrl;
    } catch (error) {
      console.error("GitHub auth: Failed to parse URL", error);
      return repoUrl;
    }
  }
}
