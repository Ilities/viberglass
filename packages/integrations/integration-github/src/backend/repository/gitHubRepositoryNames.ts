export interface GitHubRepositoryName {
  owner: string
  repo: string
}

export interface GitHubPullRequestRef extends GitHubRepositoryName {
  number: number
}

const NAME = '[A-Za-z0-9_.-]+'
const REPOSITORY_PATTERNS = [
  // owner/repo
  new RegExp(`^(${NAME})/(${NAME})$`),
  // https://github.com/owner/repo, github.com/owner/repo, with optional .git, path or query
  new RegExp(`^(?:https?://)?(?:www\\.)?github\\.com/(${NAME})/(${NAME})(?:[/?#].*)?$`, 'i'),
  // git@github.com:owner/repo.git
  new RegExp(`^git@github\\.com:(${NAME})/(${NAME})$`, 'i'),
]
const PULL_REQUEST_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/
const CLONE_URL = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i

/** Reads `owner/repo` or a GitHub URL (web, clone or SSH); null when it isn't one. */
export function parseGitHubRepository(input: string): GitHubRepositoryName | null {
  const trimmed = input.trim().replace(/\/+$/, '')
  for (const pattern of REPOSITORY_PATTERNS) {
    const match = pattern.exec(trimmed)
    if (!match) continue
    const repo = match[2].replace(/\.git$/i, '')
    if (!repo || repo === '.' || repo === '..') return null
    return { owner: match[1], repo }
  }
  return null
}

/** A github.com pull request URL as owner, repo and number; null for anything else. */
export function parseGitHubPullRequestUrl(url: string): GitHubPullRequestRef | null {
  const match = PULL_REQUEST_URL.exec(url)
  return match ? { owner: match[1], repo: match[2], number: Number(match[3]) } : null
}

/** Owner and name from a repository's clone URL, HTTPS or SSH. */
export function parseGitHubCloneUrl(repositoryUrl: string): GitHubRepositoryName {
  const match = repositoryUrl.match(CLONE_URL)
  if (!match) throw new Error(`Could not parse owner/repo from URL: ${repositoryUrl}`)
  return { owner: match[1], repo: match[2] }
}
