import { GitHubRepositoryHost } from '../../src/backend/repository/GitHubRepositoryHost'

const URL_92 = 'https://github.com/Ilities/token.observer/pull/92'

function respondWith(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })
}

function host(fetch: jest.Mock) {
  return new GitHubRepositoryHost({ fetch, apiBaseUrl: 'https://api.github.com' })
}

describe('GitHubRepositoryHost pull request outcomes', () => {
  it('owns github.com pull request URLs only', () => {
    const source = host(jest.fn())

    expect(source.ownsPullRequest(URL_92)).toBe(true)
    expect(source.ownsPullRequest(`${URL_92}/`)).toBe(true)
    expect(source.ownsPullRequest('https://github.com/Ilities/token.observer/issues/92')).toBe(false)
    expect(source.ownsPullRequest('https://gitlab.com/a/b/-/merge_requests/1')).toBe(false)
  })

  it('reads the pull request with the token', async () => {
    const fetchFn = respondWith(200, { state: 'open', merged_at: null, closed_at: null, comments: 2, review_comments: 5 })

    const outcome = await host(fetchFn).fetchPullRequestOutcome(URL_92, 'tok')

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.github.com/repos/Ilities/token.observer/pulls/92',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
    )
    expect(outcome).toEqual({ state: 'open', mergedAt: null, closedAt: null, commentCount: 2, reviewCommentCount: 5, mergedBy: null })
  })

  it('reports a closed pull request with a merge time as merged', async () => {
    const fetchFn = respondWith(200, {
      state: 'closed',
      merged_at: '2026-04-12T10:19:31Z',
      closed_at: '2026-04-12T10:19:31Z',
      comments: 0,
      review_comments: 0,
      merged_by: { login: 'dev-koskinen' },
    })

    const outcome = await host(fetchFn).fetchPullRequestOutcome(URL_92, 'tok')

    expect(outcome.state).toBe('merged')
    expect(outcome.mergedBy).toBe('dev-koskinen')
    expect(outcome.mergedAt).toEqual(new Date('2026-04-12T10:19:31Z'))
  })

  it('reports a closed pull request without a merge time as closed', async () => {
    const fetchFn = respondWith(200, { state: 'closed', merged_at: null, closed_at: '2026-04-12T10:19:31Z' })

    const outcome = await host(fetchFn).fetchPullRequestOutcome(URL_92, 'tok')

    expect(outcome).toMatchObject({ state: 'closed', mergedAt: null, commentCount: 0, reviewCommentCount: 0 })
  })

  it('throws on an error status', async () => {
    await expect(host(respondWith(404, {})).fetchPullRequestOutcome(URL_92, 'tok')).rejects.toThrow('GitHub returned 404')
  })

  it('throws on an unrecognised body', async () => {
    await expect(host(respondWith(200, { state: 'draft' })).fetchPullRequestOutcome(URL_92, 'tok')).rejects.toThrow(
      'Unexpected GitHub pull request response',
    )
  })
})
