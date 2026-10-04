import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FieldErrors } from '@/lib/fieldErrors'
import { RegisterPage } from './RegisterPage'

const mockRegister = jest.fn()
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ register: mockRegister, status: 'unauthenticated' }) }))

describe('RegisterPage', () => {
  it('shows what a refused field needs beside it, keeps what was typed, and moves focus there', async () => {
    mockRegister.mockRejectedValue(new FieldErrors({ email: 'Enter a full email address, like name@company.com.' }))
    render(
      <Theme>
        <MemoryRouter>
          <RegisterPage />
        </MemoryRouter>
      </Theme>
    )

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alex@acme' } })
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Alex' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-enough' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    const email = screen.getByLabelText('Email')
    expect(await screen.findByText('Enter a full email address, like name@company.com.')).toBeInTheDocument()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(email).toHaveAccessibleDescription('Enter a full email address, like name@company.com.'))
    expect(email).toHaveFocus()
    expect(screen.getByLabelText('Full name')).toHaveValue('Alex')
  })
})
