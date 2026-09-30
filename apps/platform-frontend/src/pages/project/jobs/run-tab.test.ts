import { resolveRunTab } from './run-tab'

describe('resolveRunTab', () => {
  it('opens the view a link asks for', () => {
    expect(resolveRunTab('prompt', false)).toBe('prompt')
    expect(resolveRunTab('log', false)).toBe('log')
    expect(resolveRunTab('record', true)).toBe('record')
  })

  it('keeps the record from anyone but admins', () => {
    expect(resolveRunTab('record', false)).toBe('activity')
  })

  it('falls back to activity', () => {
    expect(resolveRunTab(null, true)).toBe('activity')
    expect(resolveRunTab('nonsense', true)).toBe('activity')
  })
})
