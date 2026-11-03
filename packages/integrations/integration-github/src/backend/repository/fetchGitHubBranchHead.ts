import type { RepositoryRef } from '@viberglass/integration-core'
import { isObjectRecord } from '@viberglass/types'
import type { GitHubApi } from './gitHubApi'
import { requestGitHub, tokenError } from './gitHubRequest'

export async function fetchGitHubBranchHead(api: GitHubApi, repository: RepositoryRef, branch: string, token: string): Promise<string | null> {
  const reply = await requestGitHub(api, `/repos/${repository.fullName}/branches/${encodeURIComponent(branch)}`, token)
  const rejected = tokenError(reply.status, reply.headers)
  if (rejected) throw rejected
  if (reply.status === 404) return null
  if (reply.status !== 200) throw new Error(`GitHub returned ${reply.status} for ${repository.fullName}@${branch}`)
  const sha = isObjectRecord(reply.body) && isObjectRecord(reply.body.commit) ? reply.body.commit.sha : undefined
  if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) throw new Error('Unexpected GitHub branch response')
  return sha
}
