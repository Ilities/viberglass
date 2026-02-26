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
