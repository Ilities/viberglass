import { addressPath, repositoryWebUrl, gitHubTokenUrl } from './repositoryAddress'

describe('repositoryAddress', () => {
  it('shows an address by its path, whatever the host', () => {
    expect(addressPath('https://github.com/acme/web/pull/12')).toBe('acme/web/pull/12')
    expect(addressPath('https://gitlab.example.com/group/web.git')).toBe('group/web')
    expect(addressPath('acme/web')).toBe('acme/web')
  })

  it('links a repository only when its address names a host', () => {
    expect(repositoryWebUrl('https://gitlab.example.com/group/web.git')).toBe('https://gitlab.example.com/group/web')
    expect(repositoryWebUrl('github.com/acme/web')).toBe('https://github.com/acme/web')
    expect(repositoryWebUrl('acme/web')).toBeNull()
  })
})

describe('gitHubTokenUrl', () => {
  it('asks for write access to contents and pull requests', () => {
    const url = new URL(gitHubTokenUrl(''))
    expect(url.origin + url.pathname).toBe('https://github.com/settings/personal-access-tokens/new')
    expect(url.searchParams.get('contents')).toBe('write')
    expect(url.searchParams.get('pull_requests')).toBe('write')
    expect(url.searchParams.has('target_name')).toBe(false)
  })

  it.each(['acme/web', 'https://github.com/acme/web', 'github.com/acme/web.git', 'git@github.com:acme/web.git'])(
    'makes %s the token owner',
    (repository) => {
      expect(new URL(gitHubTokenUrl(repository)).searchParams.get('target_name')).toBe('acme')
    },
  )
})
