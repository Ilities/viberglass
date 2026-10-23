import { armFacts, armState, formatCostUsd, formatDurationMs } from './comparison-facts'

describe('comparison facts', () => {
  it('formats durations and costs compactly', () => {
    expect(formatDurationMs(42_000)).toBe('42s')
    expect(formatDurationMs(252_000)).toBe('4m 12s')
    expect(formatDurationMs(3_900_000)).toBe('1h 5m')
    expect(formatCostUsd(1.234)).toBe('$1.23')
    expect(formatCostUsd(0.004)).toBe('<$0.01')
  })

  it("lists only the facts a fork's runs reported", () => {
    expect(armFacts({ model: 'glm-4.6', runs: 2, durationMs: 252_000, costUsd: 0.5 })).toEqual(['glm-4.6', '2 runs', '4m 12s', '$0.50'])
    expect(armFacts({ model: null, runs: 1, durationMs: null, costUsd: null })).toEqual(['1 run'])
  })

  it('says where a fork stands', () => {
    const arm = { running: false, runs: 1, lastRunStatus: 'completed' as const, pullRequestUrl: null }
    expect(armState({ ...arm, running: true })).toBe('Working…')
    expect(armState({ ...arm, runs: 0, lastRunStatus: null })).toBe("Didn't start")
    expect(armState({ ...arm, lastRunStatus: 'failed' })).toBe('Last run failed')
    expect(armState({ ...arm, pullRequestUrl: 'https://github.com/acme/app/pull/3' })).toBe('Pull request open')
    expect(armState(arm)).toBe('Finished')
  })
})
