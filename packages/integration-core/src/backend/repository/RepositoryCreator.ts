import type { NewRepository, RepositoryAccess, RepositoryOwner } from '@viberglass/types'

/**
 * Creating repositories on a code host with a connection's token. A new
 * repository is private and starts with a README, so its default branch
 * exists for agents to branch off.
 */
export interface RepositoryCreator {
  /** Accounts the token can create repositories under, its own first. Throws RepositoryAccessError when the token is refused. */
  listOwners(token: string): Promise<RepositoryOwner[]>
  /** Throws RepositoryAccessError saying what to change when the host refuses. */
  createRepository(repository: NewRepository, token: string): Promise<RepositoryAccess>
}
