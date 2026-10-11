import type { PullRequestToOpen } from '@viberglass/integration-core'
import { GitHubRepositoryHost } from '../../src/backend/repository/GitHubRepositoryHost'

function response(status: number, body: unknown) {
  return { ok: status < 400, status, headers: new Headers(), json: async () => body }
}

function host(fetch: jest.Mock) {
  return new GitHubRepositoryHost({ fetch, apiBaseUrl: 'https://api.github.com' })
}

const samePullRequest: PullRequestToOpen = {
  sourceRepository: 'https://github.com/acme/web.git',
  destinationRepository: 'https://github.com/acme/web',
  head: 'viberglass/task-1',
  base: 'main',
  title: 'fix: price refresh',
  body: 'Fixes the refresh',
}

const alreadyExists = response(422, {
  message: 'Validation Failed',
  errors: [{ resource: 'PullRequest', code: 'custom', message: 'A pull request already exists for acme:viberglass/task-1.' }],
})

describe('GitHubRepositoryHost.openPullRequest', () => {
  it('opens a pull request on the same repository with the token', async () => {
    const fetchFn = jest.fn().mockResolvedValue(response(201, { id: 1, html_url: 'https://github.com/acme/web/pull/5' }))

    await expect(host(fetchFn).openPullRequest(samePullRequest, 'tok')).resolves.toBe('https://github.com/acme/web/pull/5')

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/acme/web/pulls')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toEqual({
      title: 'fix: price refresh',
      head: 'viberglass/task-1',
      base: 'main',
      body: 'Fixes the refresh',
      maintainer_can_modify: true,
    })
  })

  it("opens a fork's pull request against the destination with an owner:branch head", async () => {
    const fetchFn = jest.fn().mockResolvedValue(response(201, { html_url: 'https://github.com/acme/web/pull/6' }))

    await host(fetchFn).openPullRequest({ ...samePullRequest, sourceRepository: 'git@github.com:bot/web.git' }, 'tok')

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/acme/web/pulls')
    const payload = JSON.parse(init.body)
    expect(payload.head).toBe('bot:viberglass/task-1')
    expect(payload.head_repo).toBeUndefined()
  })

  it('names the head repository for a pull request between repositories of the same owner', async () => {
    const fetchFn = jest.fn().mockResolvedValue(response(201, { html_url: 'https://github.com/acme/web/pull/7' }))

    await host(fetchFn).openPullRequest({ ...samePullRequest, sourceRepository: 'https://github.com/acme/web-mirror' }, 'tok')

    const payload = JSON.parse(fetchFn.mock.calls[0][1].body)
    expect(payload).toMatchObject({ head: 'acme:viberglass/task-1', head_repo: 'web-mirror' })
  })

  it('returns the open pull request when the branch already has one', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(alreadyExists)
      .mockResolvedValueOnce(response(200, [{ html_url: 'https://github.com/acme/web/pull/4' }]))

    await expect(host(fetchFn).openPullRequest(samePullRequest, 'tok')).resolves.toBe('https://github.com/acme/web/pull/4')

    const [url, init] = fetchFn.mock.calls[1]
    expect(url).toBe('https://api.github.com/repos/acme/web/pulls?head=acme%3Aviberglass%2Ftask-1&state=open')
    expect(init.headers.Authorization).toBe('Bearer tok')
  })

  it("falls back to the repository's pull requests when the existing one can't be found", async () => {
    const fetchFn = jest.fn().mockResolvedValueOnce(alreadyExists).mockResolvedValueOnce(response(200, []))

    await expect(host(fetchFn).openPullRequest(samePullRequest, 'tok')).resolves.toBe('https://github.com/acme/web/pulls')
  })

  it("explains why GitHub didn't open the pull request", async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      response(422, { message: 'Validation Failed', errors: [{ code: 'invalid', field: 'base' }, { message: 'No commits between main and viberglass/task-1' }] }),
    )

    await expect(host(fetchFn).openPullRequest(samePullRequest, 'tok')).rejects.toThrow(
      'GitHub PR Creation Failed: Validation Failed: invalid; No commits between main and viberglass/task-1',
    )
  })

  it("says when GitHub can't be reached", async () => {
    const fetchFn = jest.fn().mockRejectedValue(new TypeError('fetch failed'))

    await expect(host(fetchFn).openPullRequest(samePullRequest, 'tok')).rejects.toThrow('GitHub PR Creation Failed: fetch failed')
  })

  it("refuses a repository URL that isn't GitHub's", async () => {
    const fetchFn = jest.fn()

    await expect(
      host(fetchFn).openPullRequest({ ...samePullRequest, destinationRepository: 'https://gitlab.com/acme/web' }, 'tok'),
    ).rejects.toThrow('Could not parse owner/repo from URL: https://gitlab.com/acme/web')
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
