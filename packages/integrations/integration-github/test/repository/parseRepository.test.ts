import { GitHubRepositoryHost } from '../../src/backend/repository/GitHubRepositoryHost'

const host = new GitHubRepositoryHost({ fetch: jest.fn() })

describe('GitHubRepositoryHost.parseRepository', () => {
  it.each([
    'acme/web',
    'https://github.com/acme/web',
    'https://github.com/acme/web.git',
    'https://github.com/acme/web/',
    'https://github.com/acme/web/tree/main/src',
    'github.com/acme/web',
    'http://www.github.com/acme/web?tab=readme',
    'git@github.com:acme/web.git',
    '  acme/web  ',
  ])('reads %s', (input) => {
    expect(host.parseRepository(input)).toEqual({ fullName: 'acme/web', url: 'https://github.com/acme/web' })
  })

  it('keeps dots and dashes in names', () => {
    expect(host.parseRepository('ilities/token.observer')).toEqual({
      fullName: 'ilities/token.observer',
      url: 'https://github.com/ilities/token.observer',
    })
  })

  it.each(['web', 'https://gitlab.com/acme/web', 'acme/web/extra', 'acme/..', ''])('refuses %p', (input) => {
    expect(host.parseRepository(input)).toBeNull()
  })

  it('reads repositories and pull requests on a GitHub Enterprise server, by its API address', () => {
    const enterprise = new GitHubRepositoryHost({ fetch: jest.fn(), apiBaseUrl: 'https://git.acme.dev/api/v3' })

    expect(enterprise.webHost).toBe('git.acme.dev')
    expect(host.webHost).toBe('github.com')
    expect(enterprise.parseRepository('https://git.acme.dev/acme/web.git')).toEqual({ fullName: 'acme/web', url: 'https://git.acme.dev/acme/web' })
    expect(enterprise.parseRepository('git@git.acme.dev:acme/web.git')).toEqual({ fullName: 'acme/web', url: 'https://git.acme.dev/acme/web' })
    expect(enterprise.parseRepository('acme/web')).toEqual({ fullName: 'acme/web', url: 'https://git.acme.dev/acme/web' })
    expect(enterprise.parseRepository('https://github.com/acme/web')).toBeNull()
    expect(enterprise.ownsPullRequest('https://git.acme.dev/acme/web/pull/7')).toBe(true)
    expect(host.ownsPullRequest('https://git.acme.dev/acme/web/pull/7')).toBe(false)
  })

  it('sends x-access-token as the git username', () => {
    expect(host.gitUsername).toBe('x-access-token')
  })
})
