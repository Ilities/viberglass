import { PullRequestMergeError } from '@viberglass/integration-core'
import type { GitHubApi } from './gitHubApi'
import { readString, requestGitHub, tokenError } from './gitHubRequest'
import { parseGitHubPullRequestUrl } from './gitHubRepositoryNames'

/** Squash-merges through the REST API; GitHub refuses with 409 when the head is no longer `expectedHeadSha`. */
export async function mergeGitHubPullRequest(api: GitHubApi, pullRequestUrl: string, token: string, expectedHeadSha: string): Promise<string> {
  const ref = parseGitHubPullRequestUrl(pullRequestUrl, api.webHost)
  if (!ref) throw new Error(`Not a GitHub pull request URL: ${pullRequestUrl}`)
  const reply = await requestGitHub(api, `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/merge`, token, {
    method: 'PUT',
    body: { sha: expectedHeadSha, merge_method: 'squash' },
  })
  const rejected = tokenError(reply.status, reply.headers)
  if (rejected) throw rejected

  const message = readString(reply.body, 'message')
  if (reply.status === 409) {
    throw new PullRequestMergeError('HEAD_MOVED', 'The change got new commits since you looked at it. Look at it again, then make it live.')
  }
  if (reply.status === 405) {
    throw new PullRequestMergeError('NOT_MERGEABLE', `GitHub won't merge it${message ? `: ${message}` : ''}.`)
  }
  if (reply.status !== 200) throw new Error(`GitHub returned ${reply.status} merging ${pullRequestUrl}${message ? `: ${message}` : ''}`)
  const sha = readString(reply.body, 'sha')
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) throw new Error('Unexpected GitHub merge response')
  return sha
}
