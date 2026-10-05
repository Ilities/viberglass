import { resolveRunTab } from './run-tab'

describe('resolveRunTab', () => {
  it('opens the view a link asks for, the record included, for anyone', () => {
    expect(resolveRunTab('prompt')).toBe('prompt')
    expect(resolveRunTab('activity')).toBe('activity')
    expect(resolveRunTab('record')).toBe('record')
  })

  it('opens on the log, where the agent\'s steps are', () => {
    expect(resolveRunTab(null)).toBe('log')
    expect(resolveRunTab('nonsense')).toBe('log')
  })
})
