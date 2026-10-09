/** The credentials git sends to the repository's host over HTTPS. */
export interface GitAuth {
  /** Depends on the code host, which names it in the job. */
  username: string;
  token: string;
}

/**
 * The HTTPS form of a repository URL, for git's remote. It never carries
 * credentials; those travel per invocation (see gitAuthEnvironment).
 */
export function toRemoteUrl(repoUrl: string): string {
  const sshMatch = repoUrl.match(/^(?:ssh:\/\/)?git@([^/:]+)[:/](.+)$/);
  return sshMatch ? `https://${sshMatch[1]}/${sshMatch[2]}` : repoUrl;
}

/**
 * The environment that authenticates one git invocation, through git's
 * GIT_CONFIG_COUNT/KEY/VALUE (git >= 2.31): it applies to that process only
 * and is never written to .git/config, which the agent can read. The header
 * is scoped to the repository's origin so a redirect doesn't carry it to
 * another host. Empty without credentials or a parseable URL.
 */
export function gitAuthEnvironment(repoUrl: string, auth?: GitAuth): NodeJS.ProcessEnv {
  if (!auth) return {};
  let origin: string;
  try {
    const url = new URL(toRemoteUrl(repoUrl));
    origin = `${url.protocol}//${url.host}/`;
  } catch {
    return {};
  }
  const basic = Buffer.from(`${auth.username}:${auth.token}`, "utf8").toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: `http.${origin}.extraheader`,
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
  };
}
