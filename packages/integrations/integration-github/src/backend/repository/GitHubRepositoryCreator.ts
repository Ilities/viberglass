import type { RepositoryCreator } from '@viberglass/integration-core'
import type { NewRepository, RepositoryAccess, RepositoryOwner } from '@viberglass/types'
import { createGitHubRepository } from './createGitHubRepository'
import type { GitHubApi } from './gitHubApi'
import { listGitHubRepositoryOwners } from './listGitHubRepositoryOwners'

export class GitHubRepositoryCreator implements RepositoryCreator {
  constructor(private readonly api: GitHubApi) {}

  listOwners(token: string): Promise<RepositoryOwner[]> {
    return listGitHubRepositoryOwners(this.api, token)
  }

  createRepository(repository: NewRepository, token: string): Promise<RepositoryAccess> {
    return createGitHubRepository(this.api, repository, token)
  }
}
