import { GitHubRepositoryHost } from '../../src/backend/repository/GitHubRepositoryHost'

const REF = { fullName: 'acme/web', url: 'https://github.com/acme/web' }

function respondWith(status: number, body: unknown, headers: Record<string, string> = {}) {
  return jest.fn(async (_url: string, _init: RequestInit) => ({
    ok: status < 400,
    status,
    headers: new Headers(headers),
    json: async () => body,
  }))
}

function host(fetch: ReturnType<typeof respondWith> | jest.Mock, apiBaseUrl = 'https://api.github.com') {
  return new GitHubRepositoryHost({ fetch, apiBaseUrl })
}

const writableRepository = {
  full_name: 'Acme/web',
  default_branch: 'develop',
  private: true,
  permissions: { pull: true, push: true },
}

describe('GitHubRepositoryHost.checkAccess', () => {
  it("returns GitHub's canonical name and default branch when the token can push", async () => {
    const fetchFn = respondWith(200, writableRepository)

    await expect(host(fetchFn).checkAccess(REF, 'github_pat_abc')).resolves.toEqual({
      fullName: 'Acme/web',
      url: 'https://github.com/Acme/web',
      defaultBranch: 'develop',
      isPrivate: true,
    })
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.github.com/repos/acme/web',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer github_pat_abc' }),
      }),
    )
  })

  it('says when the token can read but not push', async () => {
    const fetchFn = respondWith(200, { ...writableRepository, permissions: { pull: true, push: false } })

    await expect(host(fetchFn).checkAccess(REF, 't')).rejects.toMatchObject({
      code: 'REPOSITORY_READ_ONLY',
      message: expect.stringContaining("can read acme/web but can't push to it"),
    })
  })

  it('catches a classic token without the repo scope', async () => {
    const fetchFn = respondWith(200, writableRepository, { 'x-oauth-scopes': 'read:org, gist' })

    await expect(host(fetchFn).checkAccess(REF, 'ghp_abc')).rejects.toMatchObject({ code: 'REPOSITORY_READ_ONLY' })
  })

  it('accepts public_repo for a public repository', async () => {
    const fetchFn = respondWith(200, { ...writableRepository, private: false }, { 'x-oauth-scopes': 'public_repo' })

    await expect(host(fetchFn).checkAccess(REF, 'ghp_abc')).resolves.toMatchObject({ isPrivate: false })
  })

  it.each([
    [401, {}, {}, 'TOKEN_REJECTED', 'GitHub rejected this token'],
    [404, {}, {}, 'REPOSITORY_NOT_FOUND', "Couldn't find acme/web"],
    [403, { message: 'Resource protected by organization SAML enforcement.' }, {}, 'REPOSITORY_FORBIDDEN', 'SAML enforcement'],
    [403, {}, { 'x-ratelimit-remaining': '0' }, 'HOST_RATE_LIMITED', 'rate limiting'],
    [500, {}, {}, 'HOST_ERROR', 'HTTP 500'],
  ])('explains HTTP %i', async (status, body, headers, code, message) => {
    const check = host(respondWith(status, body, headers)).checkAccess(REF, 't')

    await expect(check).rejects.toMatchObject({ code, message: expect.stringContaining(message) })
  })

  it("says when GitHub can't be reached", async () => {
    const fetchFn = jest.fn(async () => {
      throw new TypeError('fetch failed')
    })

    await expect(host(fetchFn).checkAccess(REF, 't')).rejects.toMatchObject({ code: 'HOST_UNREACHABLE' })
  })

  it("uses GitHub's address for the repository and a configured API base", async () => {
    const fetchFn = respondWith(200, { ...writableRepository, html_url: 'https://github.acme.internal/Acme/web' })

    const access = await host(fetchFn, 'https://github.acme.internal/api/v3/').checkAccess(REF, 't')

    expect(fetchFn).toHaveBeenCalledWith('https://github.acme.internal/api/v3/repos/acme/web', expect.anything())
    expect(access.url).toBe('https://github.acme.internal/Acme/web')
  })

  describe('without a configured API base', () => {
    const original = process.env.GITHUB_API_URL
    afterEach(() => {
      if (original === undefined) delete process.env.GITHUB_API_URL
      else process.env.GITHUB_API_URL = original
    })

    it('reads GITHUB_API_URL', async () => {
      process.env.GITHUB_API_URL = 'http://localhost:4010/'
      const fetchFn = respondWith(200, writableRepository)

      await new GitHubRepositoryHost({ fetch: fetchFn }).checkAccess(REF, 't')

      expect(fetchFn).toHaveBeenCalledWith('http://localhost:4010/repos/acme/web', expect.anything())
    })

    it('falls back to api.github.com', async () => {
      delete process.env.GITHUB_API_URL
      const fetchFn = respondWith(200, writableRepository)

      await new GitHubRepositoryHost({ fetch: fetchFn }).checkAccess(REF, 't')

      expect(fetchFn).toHaveBeenCalledWith('https://api.github.com/repos/acme/web', expect.anything())
    })
  })
})
