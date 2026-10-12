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
