import type { AppRelease } from '@viberglass/types'
import { canRestore, releaseStatus } from './releases-table'
import { changesLost } from './rollback-dialog'

const release = (overrides: Partial<AppRelease>): AppRelease => ({
  id: 'r1',
  projectId: 'p1',
  commitSha: 'abcdef1234567',
  status: 'ready',
  jobId: null,
  bundleSha256: null,
  bundleBytes: null,
  nodeVersion: null,
  buildLog: null,
  failureReason: null,
  wentLiveAt: null,
  liveFailure: null,
  ticketId: null,
  rolledBackAt: null,
  bundleRemoved: false,
  createdAt: '2026-11-03T12:00:00Z',
  finishedAt: null,
  ...overrides,
})

describe('releaseStatus', () => {
  it('calls the current release live', () => {
    expect(releaseStatus(release({ wentLiveAt: '2026-11-03T12:05:00Z' }), 'r1').label).toBe('Live')
  })

  it('explains a release that failed to build or to go live', () => {
    expect(releaseStatus(release({ status: 'failed', failureReason: 'No manifest' }), null)).toMatchObject({
      label: 'Build failed',
      reason: 'No manifest',
    })
    expect(releaseStatus(release({ liveFailure: '/healthz never answered' }), null)).toMatchObject({
      label: "Didn't go live",
      reason: '/healthz never answered',
    })
  })

  it('tells earlier live releases from ones never tried', () => {
    expect(releaseStatus(release({ wentLiveAt: '2026-11-03T12:05:00Z' }), 'r2').label).toBe('Was live')
    expect(releaseStatus(release({}), 'r2').label).toBe('Ready')
    expect(releaseStatus(release({ status: 'building' }), null).label).toBe('Building')
  })

  it('marks releases a rollback set aside, and ones whose bundle is gone', () => {
    expect(releaseStatus(release({ wentLiveAt: '2026-11-03T12:05:00Z', rolledBackAt: '2026-11-03T13:00:00Z' }), 'r2').label).toBe('Rolled back')
    expect(releaseStatus(release({ wentLiveAt: '2026-11-03T12:05:00Z', bundleRemoved: true }), 'r2').label).toBe('Removed')
  })
})

describe('canRestore', () => {
  it('offers releases that were live or set aside, and still have their bundle', () => {
    expect(canRestore(release({ wentLiveAt: '2026-11-03T12:05:00Z' }), 'r2')).toBe(true)
    expect(canRestore(release({ rolledBackAt: '2026-11-03T13:00:00Z' }), 'r2')).toBe(true)
    expect(canRestore(release({ wentLiveAt: '2026-11-03T12:05:00Z' }), 'r1')).toBe(false)
    expect(canRestore(release({}), 'r2')).toBe(false)
    expect(canRestore(release({ wentLiveAt: '2026-11-03T12:05:00Z', bundleRemoved: true }), 'r2')).toBe(false)
    expect(canRestore(release({ status: 'failed', rolledBackAt: '2026-11-03T13:00:00Z' }), 'r2')).toBe(false)
  })
})

describe('changesLost', () => {
  const now = new Date('2026-11-04T12:00:00Z')

  it('says how many hours of changes go', () => {
    expect(changesLost('2026-11-04T11:30:00Z', now)).toBe('Changes made in the last hour will be lost.')
    expect(changesLost('2026-11-04T10:59:00Z', now)).toBe('1 hour of changes will be lost.')
    expect(changesLost('2026-11-03T12:00:00Z', now)).toBe('24 hours of changes will be lost.')
  })
})
