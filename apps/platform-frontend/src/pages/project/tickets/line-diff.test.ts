import { diffLines } from './line-diff'

describe('diffLines', () => {
  it('marks the lines a later version removed and added', () => {
    expect(diffLines('# Greeting\nReturn hello.\nDone.', '# Greeting\nReturn Welcome to Acme.\nDone.\nAdd a test.')).toEqual([
      { kind: 'same', text: '# Greeting' },
      { kind: 'removed', text: 'Return hello.' },
      { kind: 'added', text: 'Return Welcome to Acme.' },
      { kind: 'same', text: 'Done.' },
      { kind: 'added', text: 'Add a test.' },
    ])
  })

  it('finds nothing changed in identical versions', () => {
    expect(diffLines('a\nb', 'a\nb').every((line) => line.kind === 'same')).toBe(true)
  })
})
