export interface GitHubRepositoryName {
  owner: string
  repo: string
}

export interface GitHubPullRequestRef extends GitHubRepositoryName {
  number: number
}

const NAME = '[A-Za-z0-9_.-]+'

/** Where people browse repositories: the Enterprise server for its https://host/api/v3, else github.com. */
export function gitHubWebHost(apiBaseUrl: string): string {
  const url = new URL(apiBaseUrl)
  return /\/api\/v3\/?$/.test(url.pathname) ? url.host : 'github.com'
}

function escapeHost(host: string): string {
  return host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function repositoryPatterns(host: string): RegExp[] {
  const escaped = escapeHost(host)
  return [
    // owner/repo
    new RegExp(`^(${NAME})/(${NAME})$`),
    // https://host/owner/repo, host/owner/repo, with optional .git, path or query
    new RegExp(`^(?:https?://)?(?:www\\.)?${escaped}/(${NAME})/(${NAME})(?:[/?#].*)?$`, 'i'),
    // git@host:owner/repo.git
    new RegExp(`^git@${escaped}:(${NAME})/(${NAME})$`, 'i'),
  ]
}

/** Reads `owner/repo` or a GitHub URL (web, clone or SSH) on `host`; null when it isn't one. */
export function parseGitHubRepository(input: string, host = 'github.com'): GitHubRepositoryName | null {
  const trimmed = input.trim().replace(/\/+$/, '')
  for (const pattern of repositoryPatterns(host)) {
    const match = pattern.exec(trimmed)
    if (!match) continue
    const repo = match[2].replace(/\.git$/i, '')
    if (!repo || repo === '.' || repo === '..') return null
    return { owner: match[1], repo }
  }
  return null
}

/** A pull request URL on `host` as owner, repo and number; null for anything else. */
export function parseGitHubPullRequestUrl(url: string, host = 'github.com'): GitHubPullRequestRef | null {
  const match = new RegExp(`^https://${escapeHost(host)}/([^/]+)/([^/]+)/pull/(\\d+)/?$`).exec(url)
  return match ? { owner: match[1], repo: match[2], number: Number(match[3]) } : null
}

/** Owner and name from a repository's URL on `host`; throws for anything else. */
export function requireGitHubRepository(repositoryUrl: string, host = 'github.com'): GitHubRepositoryName {
  const name = parseGitHubRepository(repositoryUrl, host)
  if (!name) throw new Error(`Could not parse owner/repo from URL: ${repositoryUrl}`)
  return name
}
