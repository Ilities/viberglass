import { RepositoryAccessError } from '@viberglass/integration-core'
import { GitHubRepositoryHost } from '../../src/backend/repository/GitHubRepositoryHost'

const REPOSITORY = { fullName: 'Xantier/laptop-tracker', url: 'https://github.com/Xantier/laptop-tracker' }

function respondWith(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: status < 400, status, headers: new Headers(), json: async () => body })
}

function host(fetch: jest.Mock) {
  return new GitHubRepositoryHost({ fetch, apiBaseUrl: 'https://api.github.com' })
}

describe('GitHubRepositoryHost file checks', () => {
  it('finds a file on the branch', async () => {
    const fetchFn = respondWith(200, { type: 'file', name: 'viberglass.app.json' })

    await expect(host(fetchFn).hasFile(REPOSITORY, 'viberglass.app.json', 'main', 'tok')).resolves.toBe(true)
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.github.com/repos/Xantier/laptop-tracker/contents/viberglass.app.json?ref=main',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
    )
  })

  it('reports a file that is not there', async () => {
    await expect(host(respondWith(404, { message: 'Not Found' })).hasFile(REPOSITORY, 'viberglass.app.json', 'main', 'tok')).resolves.toBe(false)
  })

  it('reports a rejected token', async () => {
    await expect(host(respondWith(401, {})).hasFile(REPOSITORY, 'viberglass.app.json', 'main', 'tok')).rejects.toBeInstanceOf(RepositoryAccessError)
  })
})
