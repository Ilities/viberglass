import { RepositoryAccessError } from '@viberglass/integration-core'
import { isObjectRecord, type NewRepository, type RepositoryAccess } from '@viberglass/types'
import type { GitHubApi } from './gitHubApi'
import { type GitHubReply, readString, requestGitHub, tokenError } from './gitHubRequest'
import { gitHubTokenLogin } from './listGitHubRepositoryOwners'

const VALID_NAME = /^[A-Za-z0-9_.-]{1,100}$/

/** Creates a private repository with a README, under the token's own account or an organisation. */
export async function createGitHubRepository(api: GitHubApi, repository: NewRepository, token: string): Promise<RepositoryAccess> {
  const name = repository.name.trim()
  if (!VALID_NAME.test(name) || name === '.' || name === '..') {
    throw new RepositoryAccessError(
      'REPOSITORY_NAME_INVALID',
      'A repository name can use letters, numbers, hyphens, underscores and dots, up to 100 characters, for example laptop-tracker.',
    )
  }
  const owner = repository.owner.trim()
  const login = await gitHubTokenLogin(api, token)
  const ownAccount = login.toLowerCase() === owner.toLowerCase()
  const path = ownAccount ? '/user/repos' : `/orgs/${encodeURIComponent(owner)}/repos`

  const reply = await requestGitHub(api, path, token, { method: 'POST', body: { name, private: true, auto_init: true } })
  if (reply.status === 201) return toAccess(reply.body, `${owner}/${name}`, api.webHost)
  throw toError(reply, owner, name, ownAccount)
}

function toAccess(body: unknown, typedName: string, webHost: string): RepositoryAccess {
  const fullName = readString(body, 'full_name') ?? typedName
  return {
    fullName,
    url: readString(body, 'html_url') ?? `https://${webHost}/${fullName}`,
    defaultBranch: readString(body, 'default_branch') ?? 'main',
    isPrivate: isObjectRecord(body) ? body.private !== false : true,
  }
}

function toError(reply: GitHubReply, owner: string, name: string, ownAccount: boolean): RepositoryAccessError {
  const refused = tokenError(reply.status, reply.headers)
  if (refused) return refused
  if (reply.status === 403 || reply.status === 404) {
    return new RepositoryAccessError('CREATE_FORBIDDEN', `This token can't create repositories in ${owner}: ${permissionHint(owner, ownAccount)}`)
  }
  if (reply.status === 422) {
    const details = detailMessages(reply.body)
    if (details.some((message) => /already exists/i.test(message))) {
      return new RepositoryAccessError(
        'REPOSITORY_EXISTS',
        `There's already a repository called ${owner}/${name}. Choose another name, or use the existing repository.`,
      )
    }
    const reason = details[0] ?? readString(reply.body, 'message')
    return new RepositoryAccessError('REPOSITORY_NAME_INVALID', `GitHub couldn't create ${owner}/${name}${reason ? `: "${reason}"` : ''}.`)
  }
  return new RepositoryAccessError('HOST_ERROR', `GitHub couldn't create the repository (HTTP ${reply.status}). Try again in a moment.`)
}

function permissionHint(owner: string, ownAccount: boolean): string {
  const fineGrained = ownAccount
    ? 'a fine-grained token needs access to All repositories, with Administration, Contents and Pull requests set to Read and write'
    : `a fine-grained token needs ${owner} as its resource owner and access to All repositories, with Administration, Contents and Pull requests set to Read and write`
  const organization = ownAccount ? '' : ` The organisation also has to let its members create repositories.`
  return `${fineGrained}; a classic token needs the repo scope.${organization}`
}

function detailMessages(body: unknown): string[] {
  const errors = isObjectRecord(body) && Array.isArray(body.errors) ? body.errors : []
  return errors.flatMap((error) => {
    const message = readString(error, 'message')
    return message ? [message] : []
  })
}
