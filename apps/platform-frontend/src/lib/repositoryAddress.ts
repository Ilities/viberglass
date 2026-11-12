/** A repository or pull request address without its scheme and host, e.g. "acme/web/pull/12"; anything else as it is. */
export function addressPath(address: string): string {
  try {
    const path = new URL(address).pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
    return path || address
  } catch {
    return address
  }
}

/** "acme/web#12" for a GitHub pull request or "group/web!12" for a GitLab merge request; any other address as addressPath has it. */
export function pullRequestLabel(address: string): string {
  const path = addressPath(address)
  const pull = /^(.+?)\/pull\/(\d+)$/.exec(path)
  if (pull) return `${pull[1]}#${pull[2]}`
  const merge = /^(.+?)\/-\/merge_requests\/(\d+)$/.exec(path)
  return merge ? `${merge[1]}!${merge[2]}` : path
}

/** A repository identifier as a browsable URL: a URL, or host/owner/repo. A bare owner/repo names no host, so none. */
export function repositoryWebUrl(repository: string): string | null {
  if (repository.startsWith('http://') || repository.startsWith('https://')) return repository.replace(/\.git$/, '')
  const [first] = repository.split('/')
  return first.includes('.') ? `https://${repository.replace(/\.git$/, '')}` : null
}

/**
 * GitHub's new fine-grained token form, prefilled with what the agent needs (push a branch, open a PR),
 * plus Administration when the token should create the repository too.
 */
export function gitHubTokenUrl(repository: string, options: { createsRepositories?: boolean } = {}): string {
  const params = new URLSearchParams({
    name: 'Viberglass',
    description: options.createsRepositories
      ? 'Lets Viberglass create repositories, push branches and open pull requests'
      : 'Lets Viberglass agents push branches and open pull requests',
    contents: 'write',
    pull_requests: 'write',
  })
  if (options.createsRepositories) params.set('administration', 'write')
  const owner = /^(?:https?:\/\/)?(?:www\.)?(?:git@)?(?:github\.com[/:])?([A-Za-z0-9_.-]+)\/[A-Za-z0-9_.-]+/.exec(repository.trim())?.[1]
  if (owner) params.set('target_name', owner)
  return `https://github.com/settings/personal-access-tokens/new?${params.toString()}`
}

/** A repository name from what someone called the thing, e.g. "Laptop tracker" → "laptop-tracker". */
export function repositoryNameFrom(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100)
}
