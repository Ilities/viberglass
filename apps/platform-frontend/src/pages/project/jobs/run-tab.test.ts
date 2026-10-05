import { resolveRunTab } from './run-tab'

describe('resolveRunTab', () => {
  it('opens the view a link asks for', () => {
    expect(resolveRunTab('prompt', false)).toBe('prompt')
    expect(resolveRunTab('activity', false)).toBe('activity')
    expect(resolveRunTab('record', true)).toBe('record')
  })

  it('keeps the record from anyone but admins', () => {
    expect(resolveRunTab('record', false)).toBe('log')
  })

  it('opens on the log, where the agent\'s steps are', () => {
    expect(resolveRunTab(null, true)).toBe('log')
    expect(resolveRunTab('nonsense', true)).toBe('log')
  })
})
