import { render, screen } from '@testing-library/react'
import { MarkdownDocument } from './markdown-document'
import { selectionToSource } from './selectionToSource'

describe('MarkdownDocument', () => {
  it('renders the document as markdown, bold inside list items included', () => {
    const { container } = render(<MarkdownDocument source={'# Plan\n\n- **Risk:** the cache is shared\n\n| Step | Owner |\n| --- | --- |\n| One | Tomi |'} />)
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeInTheDocument()
    expect(container.querySelector('li strong')?.textContent).toBe('Risk:')
    expect(screen.getByRole('table')).toHaveTextContent('Tomi')
  })

  it('shows raw HTML as text and links only to safe addresses', () => {
    const { container } = render(<MarkdownDocument source={'<img src=x onerror=alert(1)>\n\n[ok](https://example.com) [bad](javascript:alert(1))'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('link', { name: 'ok' })).toHaveAttribute('href', 'https://example.com')
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull()
  })

  it('highlights exactly the commented text, across formatting', () => {
    const source = 'Shorten the **button label** now.'
    const { container } = render(<MarkdownDocument source={source} highlights={[{ id: 'c-1', start: source.indexOf('the'), end: source.indexOf(' now') }]} />)
    const marked = [...container.querySelectorAll('mark')].map((mark) => mark.textContent).join('')
    expect(marked).toBe('the button label')
  })
})

describe('selectionToSource', () => {
  function select(container: HTMLElement, from: string, to: string): Range {
    const range = document.createRange()
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) if (walker.currentNode instanceof Text) nodes.push(walker.currentNode)
    const startNode = nodes.find((node) => node.data.includes(from))!
    const endNode = nodes.find((node) => node.data.includes(to))!
    range.setStart(startNode, startNode.data.indexOf(from))
    range.setEnd(endNode, endNode.data.indexOf(to) + to.length)
    return range
  }

  it('maps a selection in the rendered text back to the markdown it came from', () => {
    const source = '1. Shorten the **button label** on mobile.'
    const { container } = render(<MarkdownDocument source={source} />)
    const span = selectionToSource(select(container, 'Shorten', 'label'), container, source)
    expect(span && source.slice(span.start, span.end)).toBe('Shorten the **button label')
  })

  it('maps a selection across blocks, trimmed of surrounding space', () => {
    const source = '# Plan\n\nFirst step.\n\nSecond step.'
    const { container } = render(<MarkdownDocument source={source} />)
    const span = selectionToSource(select(container, 'step.', 'Second'), container, source)
    expect(span && source.slice(span.start, span.end)).toBe('step.\n\nSecond')
  })

  it('ignores an empty selection', () => {
    const { container } = render(<MarkdownDocument source="Text" />)
    const range = document.createRange()
    range.setStart(container, 0)
    expect(selectionToSource(range, container, 'Text')).toBeNull()
  })
})
