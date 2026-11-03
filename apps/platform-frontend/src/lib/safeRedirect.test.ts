import { safeRedirect } from './safeRedirect'

describe('safeRedirect', () => {
  it('keeps relative paths with their query', () => {
    expect(safeRedirect('/spaces/demo')).toBe('/spaces/demo')
    expect(safeRedirect('/apps/tracker/open?return=%2Flaptops')).toBe('/apps/tracker/open?return=%2Flaptops')
  })

  it('falls back to home for anything that could leave the origin', () => {
    expect(safeRedirect(null)).toBe('/')
    expect(safeRedirect('')).toBe('/')
    expect(safeRedirect('https://evil.com')).toBe('/')
    expect(safeRedirect('//evil.com')).toBe('/')
    expect(safeRedirect('/\\evil.com')).toBe('/')
    expect(safeRedirect('/\t/evil.com')).toBe('/')
    expect(safeRedirect('javascript:alert(1)')).toBe('/')
  })
})
