import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NotificationSettingsPage } from './NotificationSettingsPage'

const mockSendTestEmail = jest.fn()
const mockToastError = jest.fn()
const mockGetChannels = jest.fn()
const mockLinkChat = jest.fn()
const mockUnlinkChat = jest.fn()
let mockRole = 'admin'

jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'u-1', email: 'jussi@example.com', role: mockRole } }) }))
jest.mock('@/service/api/me-api', () => ({
  getNotificationChannels: () => mockGetChannels(),
  sendTestEmail: () => mockSendTestEmail(),
  linkChat: (system: string) => mockLinkChat(system),
  unlinkChat: (system: string) => mockUnlinkChat(system),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: (message: string) => mockToastError(message) } }))

function renderPage() {
  render(
    <Theme>
      <NotificationSettingsPage />
    </Theme>
  )
}

describe('NotificationSettingsPage', () => {
  beforeEach(() => {
    mockGetChannels.mockResolvedValue({ chat: [], emailAvailable: true })
  })

  it('lets an admin send a test email and shows why it failed', async () => {
    mockRole = 'admin'
    mockSendTestEmail.mockRejectedValue(new Error("The email couldn't be sent: Email address is not verified."))
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Send test email' }))

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("The email couldn't be sent: Email address is not verified."))
  })

  it("doesn't offer it to members", async () => {
    mockRole = 'member'
    renderPage()

    expect(await screen.findByText(/Failed setups and finished tasks/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send test email' })).not.toBeInTheDocument()
  })

  it('lists each chat service with its own state, and links and unlinks by its id', async () => {
    mockRole = 'member'
    mockGetChannels.mockResolvedValue({
      chat: [
        { system: 'chat-a', label: 'Chat A', available: true, linked: false },
        { system: 'chat-b', label: 'Chat B', available: true, linked: true },
        { system: 'chat-c', label: 'Chat C', available: false, linked: false },
      ],
      emailAvailable: false,
    })
    mockLinkChat.mockResolvedValue(undefined)
    mockUnlinkChat.mockResolvedValue(undefined)
    renderPage()

    expect(await screen.findByText('Viberglass finds your Chat A account by your email, jussi@example.com.')).toBeInTheDocument()
    expect(screen.getByText(/can also reach you in Chat A, Chat B or Chat C\./)).toBeInTheDocument()
    expect(screen.getByText(/Chat C isn't connected to this workspace/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Link Chat C' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Link Chat A' }))
    await waitFor(() => expect(mockLinkChat).toHaveBeenCalledWith('chat-a'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlink' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
    await waitFor(() => expect(mockUnlinkChat).toHaveBeenCalledWith('chat-b'))
  })
})
