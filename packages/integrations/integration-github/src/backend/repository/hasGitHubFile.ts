import type { RepositoryRef } from '@viberglass/integration-core'
import type { GitHubApi } from './gitHubApi'
import { requestGitHub, tokenError } from './gitHubRequest'

export async function hasGitHubFile(api: GitHubApi, repository: RepositoryRef, path: string, branch: string, token: string): Promise<boolean> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const reply = await requestGitHub(api, `/repos/${repository.fullName}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`, token)
  const rejected = tokenError(reply.status, reply.headers)
  if (rejected) throw rejected
  if (reply.status === 404) return false
  if (reply.status !== 200) throw new Error(`GitHub returned ${reply.status} for ${path} in ${repository.fullName}@${branch}`)
  return true
}
