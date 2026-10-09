import type { PullRequestToOpen } from '@viberglass/integration-core'
import { isObjectRecord } from '@viberglass/types'
import { type GitHubApi, type GitHubResponse, restHeaders } from './gitHubApi'
import { type GitHubRepositoryName, parseGitHubCloneUrl } from './gitHubRepositoryNames'

const FAILED = 'GitHub PR Creation Failed'

/** Opens the pull request through the REST API; the open one's address when GitHub says the branch already has one. */
export async function openGitHubPullRequest(api: GitHubApi, pullRequest: PullRequestToOpen, token: string): Promise<string> {
  const source = parseGitHubCloneUrl(pullRequest.sourceRepository)
  const destination = parseGitHubCloneUrl(pullRequest.destinationRepository)
  const crossRepository = source.owner !== destination.owner || source.repo !== destination.repo
  const ownerHead = `${source.owner}:${pullRequest.head}`

  const payload: Record<string, unknown> = {
    title: pullRequest.title,
    head: crossRepository ? ownerHead : pullRequest.head,
    base: pullRequest.base,
    body: pullRequest.body,
    maintainer_can_modify: true,
  }
  // GitHub requires head_repo for cross-repo PRs within the same owner/org.
  if (crossRepository && source.owner === destination.owner) payload.head_repo = source.repo

  const response = await send(api, `${api.baseUrl}/repos/${destination.owner}/${destination.repo}/pulls`, {
    method: 'POST',
    headers: { ...restHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body: unknown = await response.json().catch(() => null)
  const record = isObjectRecord(body) ? body : {}

  if (response.ok) {
    if (typeof record.html_url !== 'string') throw new Error(`${FAILED}: GitHub's response had no pull request address`)
    return record.html_url
  }

  const details = Array.isArray(record.errors) ? record.errors.filter(isObjectRecord) : []
  const alreadyExists = details.some(
    (detail) => typeof detail.message === 'string' && detail.message.includes('A pull request already exists'),
  )
  if (response.status === 422 && alreadyExists) return existingPullRequestUrl(api, destination, ownerHead, token)

  const message = typeof record.message === 'string' && record.message ? record.message : `Request failed with status code ${response.status}`
  const detailMessages = details.flatMap((detail) =>
    typeof detail.message === 'string' ? [detail.message] : typeof detail.code === 'string' ? [detail.code] : [],
  )
  throw new Error(`${FAILED}: ${detailMessages.length > 0 ? `${message}: ${detailMessages.join('; ')}` : message}`)
}

async function existingPullRequestUrl(api: GitHubApi, destination: GitHubRepositoryName, head: string, token: string): Promise<string> {
  const query = new URLSearchParams({ head, state: 'open' })
  const response = await send(api, `${api.baseUrl}/repos/${destination.owner}/${destination.repo}/pulls?${query}`, {
    headers: restHeaders(token),
  })
  if (!response.ok) {
    throw new Error(`${FAILED}: a pull request already exists for ${head}, but looking it up failed (HTTP ${response.status})`)
  }
  const list: unknown = await response.json().catch(() => null)
  const first = Array.isArray(list) ? list[0] : undefined
  const url = isObjectRecord(first) ? first.html_url : undefined
  return typeof url === 'string' && url ? url : `https://github.com/${destination.owner}/${destination.repo}/pulls`
}

async function send(api: GitHubApi, url: string, init: RequestInit): Promise<GitHubResponse> {
  try {
    return await api.fetch(url, init)
  } catch (error) {
    throw new Error(`${FAILED}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
