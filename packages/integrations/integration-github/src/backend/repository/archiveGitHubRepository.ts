import { RepositoryAccessError, type RepositoryRef } from '@viberglass/integration-core'
import type { GitHubApi } from './gitHubApi'
import { readString, requestGitHub, tokenError } from './gitHubRequest'

// GitHub refuses longer descriptions.
const DESCRIPTION_LIMIT = 350

/** Archives the repository, leaving it read-only on GitHub, with `note` as its description. */
export async function archiveGitHubRepository(api: GitHubApi, repository: RepositoryRef, token: string, note: string): Promise<void> {
  const description = note.length > DESCRIPTION_LIMIT ? `${note.slice(0, DESCRIPTION_LIMIT - 1)}…` : note
  const reply = await requestGitHub(api, `/repos/${repository.fullName}`, token, { method: 'PATCH', body: { archived: true, description } })
  if (reply.status === 200) return
  const refused = tokenError(reply.status, reply.headers)
  if (refused) throw refused
  if (reply.status === 404) {
    throw new RepositoryAccessError('REPOSITORY_NOT_FOUND', `GitHub has no repository ${repository.fullName} this token can see.`)
  }
  if (reply.status === 403) {
    throw new RepositoryAccessError(
      'REPOSITORY_FORBIDDEN',
      `This token can't archive ${repository.fullName}: a fine-grained token needs Administration set to Read and write; a classic token needs the repo scope.`,
    )
  }
  const message = readString(reply.body, 'message')
  throw new RepositoryAccessError('HOST_ERROR', `GitHub couldn't archive ${repository.fullName} (HTTP ${reply.status}${message ? `: ${message}` : ''}).`)
}
