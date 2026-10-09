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

  it('sends x-access-token as the git username', () => {
    expect(host.gitUsername).toBe('x-access-token')
  })
})
