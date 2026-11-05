import { RepositoryAccessError } from '@viberglass/integration-core'
import { GitHubRepositoryHost } from '../../src/backend/repository/GitHubRepositoryHost'

const REPOSITORY = { fullName: 'Xantier/laptop-tracker', url: 'https://github.com/Xantier/laptop-tracker' }

function respondWith(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: status < 400, status, headers: new Headers(), json: async () => body })
}

function host(fetch: jest.Mock) {
  return new GitHubRepositoryHost({ fetch, apiBaseUrl: 'https://api.github.com' })
}

describe('GitHubRepositoryHost archiving', () => {
  it('marks the repository archived', async () => {
    const fetchFn = respondWith(200, { archived: true })

    await host(fetchFn).archiveRepository(REPOSITORY, 'tok')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/Xantier/laptop-tracker')
    expect(init).toMatchObject({ method: 'PATCH', headers: expect.objectContaining({ Authorization: 'Bearer tok' }) })
    expect(JSON.parse(init.body)).toEqual({ archived: true })
  })

  it('says what the token needs when GitHub refuses', async () => {
    await expect(host(respondWith(403, { message: 'Resource not accessible by personal access token' })).archiveRepository(REPOSITORY, 'tok'))
      .rejects.toMatchObject({ code: 'REPOSITORY_FORBIDDEN', message: expect.stringContaining('Administration') })
  })

  it('reports a repository that is gone and a rejected token', async () => {
    await expect(host(respondWith(404, {})).archiveRepository(REPOSITORY, 'tok')).rejects.toMatchObject({ code: 'REPOSITORY_NOT_FOUND' })
    await expect(host(respondWith(401, {})).archiveRepository(REPOSITORY, 'tok')).rejects.toBeInstanceOf(RepositoryAccessError)
  })
})
