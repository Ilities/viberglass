import type { PullRequestToOpen, RepositoryHost, RepositoryRef } from '@viberglass/integration-core'
import type { PullRequestOutcome, PullRequestReview, RepositoryAccess } from '@viberglass/types'
import { checkGitHubAccess } from './checkGitHubAccess'
import { fetchGitHubPullRequestOutcome } from './fetchGitHubPullRequestOutcome'
import { fetchGitHubPullRequestReview } from './fetchGitHubPullRequestReview'
import type { GitHubApi, GitHubFetch } from './gitHubApi'
import { parseGitHubPullRequestUrl, parseGitHubRepository } from './gitHubRepositoryNames'
import { openGitHubPullRequest } from './openGitHubPullRequest'

export interface GitHubRepositoryHostOptions {
  /** REST API base: GitHub Enterprise's https://host/api/v3, or a stub in the e2e suite. */
  apiBaseUrl?: string
  fetch?: GitHubFetch
}

/** GitHub repositories and pull requests, through GitHub's REST and GraphQL APIs. */
export class GitHubRepositoryHost implements RepositoryHost {
  readonly gitUsername = 'x-access-token'
  private readonly api: GitHubApi

  constructor(options: GitHubRepositoryHostOptions = {}) {
    const baseUrl = options.apiBaseUrl || process.env.GITHUB_API_URL || 'https://api.github.com'
    this.api = { baseUrl: baseUrl.replace(/\/+$/, ''), fetch: options.fetch ?? ((url, init) => fetch(url, init)) }
  }

  parseRepository(input: string): RepositoryRef | null {
    const name = parseGitHubRepository(input)
    if (!name) return null
    const fullName = `${name.owner}/${name.repo}`
    return { fullName, url: `https://github.com/${fullName}` }
  }

  checkAccess(repository: RepositoryRef, token: string): Promise<RepositoryAccess> {
    return checkGitHubAccess(this.api, repository, token)
  }

  openPullRequest(pullRequest: PullRequestToOpen, token: string): Promise<string> {
    return openGitHubPullRequest(this.api, pullRequest, token)
  }

  ownsPullRequest(url: string): boolean {
    return parseGitHubPullRequestUrl(url) !== null
  }

  fetchPullRequestOutcome(url: string, token: string): Promise<PullRequestOutcome> {
    return fetchGitHubPullRequestOutcome(this.api, url, token)
  }

  fetchPullRequestReview(url: string, token: string, since: Date | null): Promise<PullRequestReview> {
    return fetchGitHubPullRequestReview(this.api, url, token, since)
  }
}
