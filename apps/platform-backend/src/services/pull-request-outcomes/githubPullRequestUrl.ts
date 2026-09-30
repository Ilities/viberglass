const PULL_REQUEST_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/;

export interface GitHubPullRequestRef {
  owner: string;
  repo: string;
  number: number;
}

/** A github.com pull request URL as owner, repo and number; null for anything else. */
export function parseGitHubPullRequestUrl(url: string): GitHubPullRequestRef | null {
  const match = PULL_REQUEST_URL.exec(url);
  return match ? { owner: match[1], repo: match[2], number: Number(match[3]) } : null;
}
