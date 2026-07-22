import { useAuth } from '@/context/auth-context'
import { getSetupStatus } from '@/service/api/auth-api'
import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from './LoginPage'

jest.mock('@/context/auth-context', () => ({
  useAuth: jest.fn(),
}))

jest.mock('@/service/api/auth-api', () => ({
  getSetupStatus: jest.fn(),
}))

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockedGetSetupStatus = getSetupStatus as jest.MockedFunction<typeof getSetupStatus>
const login = jest.fn()
const register = jest.fn()

function renderLogin() {
  return render(
    <HelmetProvider>
      <Theme>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </Theme>
    </HelmetProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedUseAuth.mockReturnValue({
    user: null,
    status: 'unauthenticated',
    login,
    register,
    logout: jest.fn(),
  })
})

describe('LoginPage initial administrator setup', () => {
  it('turns the first login into a one-time administrator setup', async () => {
    const user = userEvent.setup()
    mockedGetSetupStatus.mockResolvedValue({ requiresInitialUser: true })
    register.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Initial Admin',
      role: 'admin',
    })
    renderLogin()

    expect(await screen.findByRole('heading', { name: 'Create the first administrator' })).toBeVisible()
    expect(screen.queryByText('Forgot password?')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Full name'), 'Initial Admin')
    await user.type(screen.getByLabelText('Email'), 'admin@example.com')
    await user.type(screen.getByLabelText('Password'), 'secure-password')
    await user.type(screen.getByLabelText('Confirm password'), 'secure-password')
    await user.click(screen.getByRole('button', { name: 'Create administrator' }))

    expect(register).toHaveBeenCalledWith('Initial Admin', 'admin@example.com', 'secure-password')
    expect(login).not.toHaveBeenCalled()
  })

  it('shows normal login without public registration after setup', async () => {
    mockedGetSetupStatus.mockResolvedValue({ requiresInitialUser: false })
    renderLogin()

    expect(await screen.findByRole('heading', { name: 'Sign in to your account' })).toBeVisible()
    expect(screen.getByText('Need an account? Ask an administrator to add you.')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument()
  })

  it('does not submit mismatched administrator passwords', async () => {
    const user = userEvent.setup()
    mockedGetSetupStatus.mockResolvedValue({ requiresInitialUser: true })
    renderLogin()

    await screen.findByRole('heading', { name: 'Create the first administrator' })
    await user.type(screen.getByLabelText('Full name'), 'Initial Admin')
    await user.type(screen.getByLabelText('Email'), 'admin@example.com')
    await user.type(screen.getByLabelText('Password'), 'secure-password')
    await user.type(screen.getByLabelText('Confirm password'), 'different-password')
    await user.click(screen.getByRole('button', { name: 'Create administrator' }))

    expect(screen.getByText('Passwords do not match.')).toBeVisible()
    expect(register).not.toHaveBeenCalled()
  })
})
