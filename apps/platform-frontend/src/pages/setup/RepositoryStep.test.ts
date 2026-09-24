import { gitHubTokenUrl } from './RepositoryStep'

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
