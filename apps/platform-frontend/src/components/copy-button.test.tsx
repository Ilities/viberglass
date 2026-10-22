import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { CopyButton } from './copy-button'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const writeText = jest.fn(() => Promise.resolve())

beforeEach(() => {
  jest.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

describe('CopyButton', () => {
  it('copies the value and says so', async () => {
    render(
      <Theme>
        <CopyButton value="git fetch origin feature" label="Copy command" />
      </Theme>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy command' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('git fetch origin feature'))
    expect(toast.success).toHaveBeenCalledWith('Copied to clipboard')
  })

  it('says when the copy fails', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))

    render(
      <Theme>
        <CopyButton value="anything" />
      </Theme>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't copy to clipboard"))
  })
})
