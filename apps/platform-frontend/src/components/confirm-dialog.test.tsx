import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import { ConfirmDialog } from './confirm-dialog'

describe('ConfirmDialog', () => {
  it('states what happens and asks before acting', () => {
    const onConfirm = jest.fn()
    const onClose = jest.fn()

    render(
      <Theme>
        <ConfirmDialog
          open
          title="Delete secret?"
          description="This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={onConfirm}
          onClose={onClose}
        />
      </Theme>
    )

    expect(screen.getByText('Delete secret?')).toBeInTheDocument()
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps the confirm button disabled while the request is in flight', () => {
    render(
      <Theme>
        <ConfirmDialog
          open
          title="Delete secret?"
          description="This action cannot be undone."
          confirmLabel="Delete"
          confirmingLabel="Deleting…"
          isConfirming
          onConfirm={jest.fn()}
          onClose={jest.fn()}
        />
      </Theme>
    )

    const confirm = screen.getByRole('button', { name: 'Deleting…' })
    expect(confirm).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('closes without acting when cancelled', () => {
    const onConfirm = jest.fn()
    const onClose = jest.fn()

    render(
      <Theme>
        <ConfirmDialog
          open
          title="Delete secret?"
          description="This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={onConfirm}
          onClose={onClose}
        />
      </Theme>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
