import { RepositoryAccessError } from '@viberglass/integration-core'
import { GitHubRepositoryHost } from '../../src/backend/repository/GitHubRepositoryHost'

const REPOSITORY = { fullName: 'Xantier/laptop-tracker', url: 'https://github.com/Xantier/laptop-tracker' }
const SHA = 'a'.repeat(40)

function respondWith(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: status < 400, status, headers: new Headers(), json: async () => body })
}

function host(fetch: jest.Mock) {
  return new GitHubRepositoryHost({ fetch, apiBaseUrl: 'https://api.github.com' })
}

describe('GitHubRepositoryHost branch heads', () => {
  it('reads the commit the branch points at', async () => {
    const fetchFn = respondWith(200, { name: 'main', commit: { sha: SHA } })

    await expect(host(fetchFn).fetchBranchHead(REPOSITORY, 'main', 'tok')).resolves.toBe(SHA)
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.github.com/repos/Xantier/laptop-tracker/branches/main',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
    )
  })

  it('has no head for a branch that does not exist yet', async () => {
    await expect(host(respondWith(404, { message: 'Branch not found' })).fetchBranchHead(REPOSITORY, 'main', 'tok')).resolves.toBeNull()
  })

  it('reports a rejected token', async () => {
    await expect(host(respondWith(401, {})).fetchBranchHead(REPOSITORY, 'main', 'tok')).rejects.toBeInstanceOf(RepositoryAccessError)
  })

  it('refuses a reply without a commit', async () => {
    await expect(host(respondWith(200, { name: 'main' })).fetchBranchHead(REPOSITORY, 'main', 'tok')).rejects.toThrow('Unexpected')
  })
})
