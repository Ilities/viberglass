import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { FullScreenReader } from './full-screen-reader'

function Reader() {
  const [open, setOpen] = useState(true)
  return (
    <Theme>
      <FullScreenReader open={open} onClose={() => setOpen(false)} title="Plan v2" meta="Written by the agent">
        <p>The plan in full.</p>
      </FullScreenReader>
    </Theme>
  )
}

describe('FullScreenReader', () => {
  it('shows the document with what it is, and leaves with the button or Escape', async () => {
    render(<Reader />)
    const dialog = screen.getByRole('dialog', { name: 'Plan v2' })
    expect(dialog).toHaveTextContent('Written by the agent')
    expect(dialog).toHaveTextContent('The plan in full.')

    await userEvent.click(screen.getByRole('button', { name: 'Exit full screen' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    render(<Reader />)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
