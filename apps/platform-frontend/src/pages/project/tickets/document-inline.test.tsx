import { render } from '@testing-library/react'
import { DocumentReader } from './phase-document-comments'

jest.mock('@/service/api/ticket-api', () => ({}))

function html(content: string) {
  return render(<DocumentReader content={content} />).container.innerHTML
}

describe('DocumentReader inline formatting', () => {
  it('renders bold inside list items', () => {
    expect(html('- **Risk:** the cache is shared')).toContain('<strong>Risk:</strong> the cache is shared')
    expect(html('1. **First** step')).toContain('<strong>First</strong> step')
  })

  it('renders code and italic, and leaves snake_case alone', () => {
    const result = html('Call `load_user` with *care*, not user_id_value')
    expect(result).toContain('>load_user</code>')
    expect(result).toContain('<em>care</em>')
    expect(result).toContain('not user_id_value')
  })

  it('keeps markers inside code literal', () => {
    expect(html('Use `**kwargs` here')).toContain('>**kwargs</code>')
  })
})
