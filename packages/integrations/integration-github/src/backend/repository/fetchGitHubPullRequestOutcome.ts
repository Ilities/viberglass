import { isObjectRecord, type PullRequestOutcome } from '@viberglass/types'
import { type GitHubApi, restHeaders } from './gitHubApi'
import { parseGitHubPullRequestUrl } from './gitHubRepositoryNames'

export async function fetchGitHubPullRequestOutcome(api: GitHubApi, pullRequestUrl: string, token: string): Promise<PullRequestOutcome> {
  const ref = parseGitHubPullRequestUrl(pullRequestUrl)
  if (!ref) throw new Error(`Not a GitHub pull request URL: ${pullRequestUrl}`)
  const { owner, repo, number } = ref

  const response = await api.fetch(`${api.baseUrl}/repos/${owner}/${repo}/pulls/${number}`, { headers: restHeaders(token) })
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${pullRequestUrl}`)

  return toOutcome(await response.json())
}

function toOutcome(body: unknown): PullRequestOutcome {
  if (!isObjectRecord(body) || (body.state !== 'open' && body.state !== 'closed')) {
    throw new Error('Unexpected GitHub pull request response')
  }
  const mergedAt = toDate(body.merged_at)

  return {
    state: mergedAt ? 'merged' : body.state,
    mergedAt,
    closedAt: toDate(body.closed_at),
    commentCount: toCount(body.comments),
    reviewCommentCount: toCount(body.review_comments),
    mergedBy: isObjectRecord(body.merged_by) && typeof body.merged_by.login === 'string' ? body.merged_by.login : null,
  }
}

function toDate(value: unknown): Date | null {
  return typeof value === 'string' ? new Date(value) : null
}

function toCount(value: unknown): number {
  return typeof value === 'number' ? value : 0
}
