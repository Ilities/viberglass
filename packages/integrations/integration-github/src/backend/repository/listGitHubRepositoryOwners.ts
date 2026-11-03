import { RepositoryAccessError } from '@viberglass/integration-core'
import { isObjectRecord, type RepositoryOwner } from '@viberglass/types'
import type { GitHubApi } from './gitHubApi'
import { readString, requestGitHub, tokenError } from './gitHubRequest'

/** The token's own account, which GitHub reads from the token itself. */
export async function gitHubTokenLogin(api: GitHubApi, token: string): Promise<string> {
  const reply = await requestGitHub(api, '/user', token)
  const login = reply.status === 200 ? readString(reply.body, 'login') : undefined
  if (login) return login
  throw (
    tokenError(reply.status, reply.headers) ??
    new RepositoryAccessError('HOST_ERROR', `GitHub couldn't read the token's account (HTTP ${reply.status}). Try again in a moment.`)
  )
}

/**
 * The token's account and the organisations it can see. Membership alone
 * doesn't mean it may create there; GitHub only says so when it's tried.
 */
export async function listGitHubRepositoryOwners(api: GitHubApi, token: string): Promise<RepositoryOwner[]> {
  const login = await gitHubTokenLogin(api, token)
  const own: RepositoryOwner = { name: login, kind: 'user' }
  // A token without read:org, or one scoped to a single account, can't list organisations; its own account still works.
  const reply = await requestGitHub(api, '/user/orgs?per_page=100', token).catch(() => null)
  if (!reply || reply.status !== 200 || !Array.isArray(reply.body)) return [own]
  const organizations = reply.body.flatMap((org): RepositoryOwner[] => {
    const name = isObjectRecord(org) ? readString(org, 'login') : undefined
    return name ? [{ name, kind: 'organization' }] : []
  })
  return [own, ...organizations]
}
