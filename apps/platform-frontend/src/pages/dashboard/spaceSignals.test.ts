import { getLastActivity, getSpaceSignal, getWorkspaceSummary } from './spaceSignals'

const space = { slug: 'web', primaryScmIntegrationId: 'github-1', scmConfig: null }
const job = (status: 'failed' | 'active' | 'completed') => ({ status, repository: 'acme/web' })

describe('getSpaceSignal', () => {
  it('asks for a repository first', () => {
    const signal = getSpaceSignal({ ...space, primaryScmIntegrationId: null }, [], [])
    expect(signal.summary).toBe('No repository connected yet.')
    expect(signal.action).toEqual({ href: '/spaces/web/settings/general', label: 'Connect repository' })
  })

  it('puts failed runs ahead of running ones and open tasks', () => {
    const signal = getSpaceSignal(space, [{ status: 'open' }], [job('failed'), job('active')])
    expect(signal.summary).toBe('1 recent run failed.')
    expect(signal.action?.label).toBe('View runs')
  })

  it('counts open tasks with the plural right', () => {
    expect(getSpaceSignal(space, [{ status: 'open' }, { status: 'in_review' }], []).summary).toBe('2 open tasks.')
  })

  it('offers no action when nothing needs attention', () => {
    const signal = getSpaceSignal(space, [{ status: 'resolved' }], [job('completed')])
    expect(signal).toEqual({ summary: 'Nothing needs attention.', color: 'green' })
  })
})

describe('getWorkspaceSummary', () => {
  it('reads as one plain line', () => {
    expect(getWorkspaceSummary(2, 6, 0)).toBe('2 spaces · 6 open tasks · nothing running')
    expect(getWorkspaceSummary(1, 1, 1)).toBe('1 space · 1 open task · 1 run in progress')
  })
})

describe('getLastActivity', () => {
  it('names the newer of the latest task and run', () => {
    const ticket = { title: 'Dark mode', timestamp: '2026-09-29T10:00:00Z' }
    const olderRun = { status: 'completed' as const, createdAt: '2026-09-28T10:00:00Z' }
    expect(getLastActivity([ticket], [olderRun])).toBe('Last activity: task "Dark mode".')
  })

  it('is empty for a space with no tasks or runs', () => {
    expect(getLastActivity([], [])).toBeNull()
  })
})
