import { PullRequestMergeError, RepositoryAccessError } from '@viberglass/integration-core'
import { GitHubRepositoryHost } from '../../src/backend/repository/GitHubRepositoryHost'

const URL_7 = 'https://github.com/Xantier/laptop-tracker/pull/7'
const HEAD = 'a'.repeat(40)
const MERGED = 'b'.repeat(40)

function respondWith(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: status < 400, status, headers: new Headers(), json: async () => body })
}

function host(fetch: jest.Mock) {
  return new GitHubRepositoryHost({ fetch, apiBaseUrl: 'https://api.github.com' })
}

describe('GitHubRepositoryHost merging', () => {
  it('squash-merges only the head that was looked at, and returns the merge commit', async () => {
    const fetchFn = respondWith(200, { sha: MERGED, merged: true, message: 'Pull Request successfully merged' })

    await expect(host(fetchFn).mergePullRequest(URL_7, 'tok', { expectedHeadSha: HEAD })).resolves.toBe(MERGED)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/Xantier/laptop-tracker/pulls/7/merge')
    expect(init).toMatchObject({ method: 'PUT', headers: expect.objectContaining({ Authorization: 'Bearer tok' }) })
    expect(JSON.parse(init.body)).toEqual({ sha: HEAD, merge_method: 'squash' })
  })

  it('says the head moved when GitHub has newer commits', async () => {
    const merging = host(respondWith(409, { message: 'Head branch was modified. Review and try the merge again.' }))
      .mergePullRequest(URL_7, 'tok', { expectedHeadSha: HEAD })

    await expect(merging).rejects.toBeInstanceOf(PullRequestMergeError)
    await expect(merging).rejects.toMatchObject({ code: 'HEAD_MOVED' })
  })

  it("passes on GitHub's reason when it won't merge", async () => {
    const merging = host(respondWith(405, { message: 'Pull Request is not mergeable' })).mergePullRequest(URL_7, 'tok', { expectedHeadSha: HEAD })

    await expect(merging).rejects.toMatchObject({ code: 'NOT_MERGEABLE', message: "GitHub won't merge it: Pull Request is not mergeable." })
  })

  it('reports a rejected token', async () => {
    await expect(host(respondWith(401, {})).mergePullRequest(URL_7, 'tok', { expectedHeadSha: HEAD })).rejects.toBeInstanceOf(RepositoryAccessError)
  })

  it('refuses an address that is not a pull request', async () => {
    await expect(host(jest.fn()).mergePullRequest('https://github.com/a/b/issues/1', 'tok', { expectedHeadSha: HEAD })).rejects.toThrow('Not a GitHub')
  })
})
