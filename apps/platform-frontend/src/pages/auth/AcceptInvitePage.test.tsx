import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AcceptInvitePage } from './AcceptInvitePage'

const mockPreview = jest.fn()
const mockAccept = jest.fn()
const mockAdoptSession = jest.fn()

jest.mock('@/service/api/account-link-api', () => ({
  getInvitePreview: (...args: unknown[]) => mockPreview(...args),
  acceptInvite: (...args: unknown[]) => mockAccept(...args),
}))
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({ adoptSession: mockAdoptSession }),
}))

function renderAt(token: string) {
  return render(
    <Theme>
      <MemoryRouter initialEntries={[`/invite/${token}`]}>
        <Routes>
          <Route path="/invite/:token" element={<AcceptInvitePage />} />
          <Route path="/" element={<p>Home</p>} />
        </Routes>
      </MemoryRouter>
    </Theme>
  )
}

describe('AcceptInvitePage', () => {
  it('says why a used link no longer works', async () => {
    mockPreview.mockRejectedValue(new Error('This invite link has expired, was revoked or was already used.'))
    renderAt('used')

    expect(await screen.findByText('This link doesn’t work any more')).toBeInTheDocument()
    expect(screen.getByText(/already used/)).toBeInTheDocument()
  })

  it('creates the account and signs in', async () => {
    mockPreview.mockResolvedValue({ email: 'maria@example.com', role: 'member', invitedByName: 'Jussi', expiresAt: '2026-10-07' })
    const session = { token: 't', user: { id: 'user-2', email: 'maria@example.com', name: 'Maria', role: 'member' } }
    mockAccept.mockResolvedValue(session)
    renderAt('abc')

    expect(await screen.findByText(/Jussi invited you/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Maria' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-enough' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => expect(mockAdoptSession).toHaveBeenCalledWith(session))
    expect(mockAccept).toHaveBeenCalledWith('abc', 'Maria', 'long-enough')
    expect(await screen.findByText('Home')).toBeInTheDocument()
  })
})
