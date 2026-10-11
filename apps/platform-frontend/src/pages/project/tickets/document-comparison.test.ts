import { compareDocuments } from './document-comparison'

const marked = (comparison: ReturnType<typeof compareDocuments>, tone: 'added' | 'removed') =>
  comparison.highlights.filter((highlight) => highlight.tone === tone).map((highlight) => comparison.source.slice(highlight.start, highlight.end))

describe('compareDocuments', () => {
  it('marks the one word that changed, not its paragraph', () => {
    const comparison = compareDocuments('# Greeting\n\nReturn hello to the customer.\n', '# Greeting\n\nReturn welcome to the customer.\n')

    expect(comparison.source).toBe('# Greeting\n\nReturn hello welcome to the customer.\n\n')
    expect(marked(comparison, 'removed')).toEqual(['hello'])
    expect(marked(comparison, 'added')).toEqual(['welcome'])
    expect(comparison.changed).toBe(true)
  })

  it('keeps a removed line and an added one as they were', () => {
    const comparison = compareDocuments('- Ship it\n- Test it', '- Ship it\n- Write docs\n- Test it')

    expect(marked(comparison, 'added')).toEqual(['- Write docs'])
    expect(comparison.highlights.every((highlight) => highlight.tone === 'added')).toBe(true)
  })

  it('finds nothing changed in identical versions', () => {
    expect(compareDocuments('a\nb', 'a\nb').changed).toBe(false)
  })
})
