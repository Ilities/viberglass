import { isObjectRecord } from "@viberglass/types";
import type {
  PullRequestOutcome,
  PullRequestOutcomeSource,
} from "./pullRequestOutcomeTypes";
import { parseGitHubPullRequestUrl } from "./githubPullRequestUrl";

export class GitHubPullRequestOutcomeSource implements PullRequestOutcomeSource {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly apiBaseUrl = "https://api.github.com",
  ) {}

  supports(pullRequestUrl: string): boolean {
    return parseGitHubPullRequestUrl(pullRequestUrl) !== null;
  }

  async fetchOutcome(pullRequestUrl: string, token: string): Promise<PullRequestOutcome> {
    const ref = parseGitHubPullRequestUrl(pullRequestUrl);
    if (!ref) {
      throw new Error(`Not a GitHub pull request URL: ${pullRequestUrl}`);
    }
    const { owner, repo, number } = ref;

    const response = await this.fetchFn(
      `${this.apiBaseUrl}/repos/${owner}/${repo}/pulls/${number}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status} for ${pullRequestUrl}`);
    }

    return toOutcome(await response.json());
  }
}

function toOutcome(body: unknown): PullRequestOutcome {
  if (!isObjectRecord(body) || (body.state !== "open" && body.state !== "closed")) {
    throw new Error("Unexpected GitHub pull request response");
  }
  const mergedAt = toDate(body.merged_at);

  return {
    state: mergedAt ? "merged" : body.state,
    mergedAt,
    closedAt: toDate(body.closed_at),
    commentCount: toCount(body.comments),
    reviewCommentCount: toCount(body.review_comments),
  };
}

function toDate(value: unknown): Date | null {
  return typeof value === "string" ? new Date(value) : null;
}

function toCount(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
