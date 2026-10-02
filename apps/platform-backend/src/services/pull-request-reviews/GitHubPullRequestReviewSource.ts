import { isObjectRecord } from "@viberglass/types";
import type { BuildPullRequestDetails, PullRequestReviewComment } from "@viberglass/types";
import { parseGitHubPullRequestUrl } from "../pull-request-outcomes/githubPullRequestUrl";
import { PREVIEW_FIELDS, previewUrlOf } from "./pullRequestPreview";

const REVIEW_QUERY = (previewFields: string) => `
query ($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      title
      state
      isDraft
      headRefName
      baseRefName
      additions
      deletions
      changedFiles
      commits { totalCount }
      reviewThreads(first: 100) {
        nodes {
          isResolved
          isOutdated
          path
          line
          comments(first: 50) { nodes { author { login } body url createdAt } }
        }
      }
      reviews(last: 50) { nodes { author { login } body url submittedAt } }
      comments(last: 50) { nodes { author { login } body url createdAt } }${previewFields}
    }
  }
}`;

export interface PullRequestReview {
  details: BuildPullRequestDetails;
  comments: PullRequestReviewComment[];
}

/**
 * A GitHub pull request and what reviewers still want changed on it: every
 * comment of each unresolved, current review thread, and review summaries
 * and conversation comments written since the last build. GraphQL, because
 * the REST API does not say whether a thread is resolved.
 */
export class GitHubPullRequestReviewSource {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly graphqlUrl = "https://api.github.com/graphql",
  ) {}

  supports(pullRequestUrl: string): boolean {
    return parseGitHubPullRequestUrl(pullRequestUrl) !== null;
  }

  async fetchReview(
    pullRequestUrl: string,
    token: string,
    since: Date | null,
  ): Promise<PullRequestReview> {
    const ref = parseGitHubPullRequestUrl(pullRequestUrl);
    if (!ref) throw new Error(`Not a GitHub pull request URL: ${pullRequestUrl}`);

    const response = await this.fetchFn(this.graphqlUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: REVIEW_QUERY(PREVIEW_FIELDS), variables: ref }),
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${pullRequestUrl}`);

    const pullRequest = readPath(await response.json(), ["data", "repository", "pullRequest"]);
    if (!isObjectRecord(pullRequest)) throw new Error("GitHub returned no pull request");

    return {
      details: toDetails(pullRequest),
      comments: [
        ...openThreadComments(pullRequest.reviewThreads),
        ...recentComments(pullRequest.reviews, "review", "submittedAt", since),
        ...recentComments(pullRequest.comments, "conversation", "createdAt", since),
      ],
    };
  }
}

function toDetails(pullRequest: Record<string, unknown>): BuildPullRequestDetails {
  const state = pullRequest.state;
  return {
    title: asString(pullRequest.title),
    state: state === "MERGED" ? "merged" : state === "CLOSED" ? "closed" : state === "OPEN" ? "open" : null,
    isDraft: pullRequest.isDraft === true,
    headBranch: asString(pullRequest.headRefName),
    baseBranch: asString(pullRequest.baseRefName),
    additions: asCount(pullRequest.additions),
    deletions: asCount(pullRequest.deletions),
    changedFiles: asCount(pullRequest.changedFiles),
    commitCount: asCount(readPath(pullRequest, ["commits", "totalCount"])),
    previewUrl: previewUrlOf(pullRequest),
  };
}

function asCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function openThreadComments(threads: unknown): PullRequestReviewComment[] {
  return nodes(threads).flatMap((thread) => {
    if (thread.isResolved === true || thread.isOutdated === true) return [];
    const path = asString(thread.path);
    const line = typeof thread.line === "number" ? thread.line : null;
    return nodes(thread.comments).flatMap((comment) => {
      const parsed = toComment(comment, "thread", "createdAt");
      return parsed ? [{ ...parsed, path, line }] : [];
    });
  });
}

function recentComments(
  connection: unknown,
  kind: "review" | "conversation",
  timeField: "submittedAt" | "createdAt",
  since: Date | null,
): PullRequestReviewComment[] {
  return nodes(connection).flatMap((node) => {
    const comment = toComment(node, kind, timeField);
    if (!comment) return [];
    const writtenAt = comment.createdAt ? new Date(comment.createdAt) : null;
    return since && writtenAt && writtenAt <= since ? [] : [comment];
  });
}

function toComment(
  node: Record<string, unknown>,
  kind: PullRequestReviewComment["kind"],
  timeField: "submittedAt" | "createdAt",
): PullRequestReviewComment | null {
  const body = asString(node.body)?.trim();
  if (!body) return null;
  return {
    kind,
    author: asString(readPath(node, ["author", "login"])),
    body,
    path: null,
    line: null,
    url: asString(node.url),
    createdAt: asString(node[timeField]),
  };
}

function nodes(connection: unknown): Record<string, unknown>[] {
  const list = isObjectRecord(connection) ? connection.nodes : undefined;
  return Array.isArray(list) ? list.filter(isObjectRecord) : [];
}

function readPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => (isObjectRecord(current) ? current[key] : undefined), value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
