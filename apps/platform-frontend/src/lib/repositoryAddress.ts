/** A repository or pull request address without its scheme and host, e.g. "acme/web/pull/12"; anything else as it is. */
export function addressPath(address: string): string {
  try {
    const path = new URL(address).pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
    return path || address
  } catch {
    return address
  }
}

/** A repository identifier as a browsable URL: a URL, or host/owner/repo. A bare owner/repo names no host, so none. */
export function repositoryWebUrl(repository: string): string | null {
  if (repository.startsWith('http://') || repository.startsWith('https://')) return repository.replace(/\.git$/, '')
  const [first] = repository.split('/')
  return first.includes('.') ? `https://${repository.replace(/\.git$/, '')}` : null
}

/** GitHub's new fine-grained token form, prefilled with what the agent needs (push a branch, open a PR). */
export function gitHubTokenUrl(repository: string): string {
  const params = new URLSearchParams({
    name: 'Viberglass',
    description: 'Lets Viberglass agents push branches and open pull requests',
    contents: 'write',
    pull_requests: 'write',
  })
  const owner = /^(?:https?:\/\/)?(?:www\.)?(?:git@)?(?:github\.com[/:])?([A-Za-z0-9_.-]+)\/[A-Za-z0-9_.-]+/.exec(repository.trim())?.[1]
  if (owner) params.set('target_name', owner)
  return `https://github.com/settings/personal-access-tokens/new?${params.toString()}`
}
