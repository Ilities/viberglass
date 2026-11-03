import type { AppRelease } from '@viberglass/types'
import { releaseStatus } from './releases-table'

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
})
