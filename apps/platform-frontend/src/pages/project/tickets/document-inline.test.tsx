import { render } from '@testing-library/react'
import { renderInline } from './document-inline'

function html(text: string) {
  return render(<p>{renderInline(text)}</p>).container.innerHTML
}

describe('renderInline', () => {
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
