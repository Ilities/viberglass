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
   * Normalise a repository URL to the HTTPS form git should use as its remote.
   *
   * The returned URL never carries credentials — those travel out of band via
   * {@link buildGitAuthEnvironment}.
   */
  static toRemoteUrl(repoUrl: string): string {
    const sshMatch = repoUrl.match(/^(?:ssh:\/\/)?git@([^/:]+)[:/](.+)$/);
    if (sshMatch) {
      return `https://${sshMatch[1]}/${sshMatch[2]}`;
    }
    return repoUrl;
  }

  /**
   * Build the environment that authenticates a single git invocation.
   *
   * Uses git's `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n` (git ≥ 2.31),
   * which apply to that one process and are never written to `.git/config`.
   *
   * The `http.<origin>.extraheader` key is scoped to the repository's origin so the
   * header is not replayed to another host on redirect.
   *
   * @returns Environment additions, or an empty object when no credentials apply.
   */
  static buildGitAuthEnvironment(
    repoUrl: string,
    token?: string,
  ): NodeJS.ProcessEnv {
    const provider = this.getProvider(repoUrl);
    if (!provider) {
      return {};
    }

    const credentials = provider.getCredentials(token);
    if (!credentials) {
      return {};
    }

    let origin: string;
    try {
      const url = new URL(this.toRemoteUrl(repoUrl));
      origin = `${url.protocol}//${url.host}/`;
    } catch {
      return {};
    }

    const basic = Buffer.from(
      `${credentials.username}:${credentials.password}`,
      "utf8",
    ).toString("base64");

    return {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `http.${origin}.extraheader`,
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
    };
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
