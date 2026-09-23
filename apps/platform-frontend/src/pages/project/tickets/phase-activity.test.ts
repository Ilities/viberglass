import { derivePhaseStatus } from './phase-activity'

const current = { position: 'current' as const, isBusy: false, hasResult: false, isResolved: false }

describe('derivePhaseStatus', () => {
  it('says "Not started" for a current phase nobody has run', () => {
    expect(derivePhaseStatus(current).label).toBe('Not started')
  })

  it('says "Agent working" only while something runs', () => {
    expect(derivePhaseStatus({ ...current, isBusy: true, hasResult: true }).label).toBe('Agent working')
  })

  it('says "Awaiting review" when a result waits on a human', () => {
    expect(derivePhaseStatus({ ...current, hasResult: true, latestRunStatus: 'completed' }).label).toBe(
      'Awaiting review'
    )
  })

  it('reports a failed latest run even when an older result exists', () => {
    expect(derivePhaseStatus({ ...current, hasResult: true, latestRunStatus: 'failed' })).toEqual({
      label: 'Failed',
      color: 'red',
    })
  })

  it('names the reason a run failed when it is known', () => {
    expect(
      derivePhaseStatus({ ...current, latestRunStatus: 'failed', latestFailureTitle: 'Model quota used up' }).label
    ).toBe('Failed: Model quota used up')
  })

  it('reports a cancelled run, unless an earlier result still awaits review', () => {
    expect(derivePhaseStatus({ ...current, latestRunStatus: 'cancelled' }).label).toBe('Cancelled')
    expect(derivePhaseStatus({ ...current, hasResult: true, latestRunStatus: 'cancelled' }).label).toBe(
      'Awaiting review'
    )
  })

  it('labels phases before and after the current one by position', () => {
    expect(derivePhaseStatus({ ...current, position: 'completed' }).label).toBe('Complete')
    expect(derivePhaseStatus({ ...current, position: 'upcoming', isBusy: true }).label).toBe('Upcoming')
  })
})
