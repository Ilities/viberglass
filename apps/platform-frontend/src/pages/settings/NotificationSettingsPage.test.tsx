import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NotificationSettingsPage } from './NotificationSettingsPage'

const mockSendTestEmail = jest.fn()
const mockToastError = jest.fn()
let mockRole = 'admin'

jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'u-1', email: 'jussi@example.com', role: mockRole } }) }))
jest.mock('@/service/api/me-api', () => ({
  getNotificationChannels: jest.fn().mockResolvedValue({ slackAvailable: false, slackLinked: false, emailAvailable: true }),
  sendTestEmail: () => mockSendTestEmail(),
  linkSlack: jest.fn(),
  unlinkSlack: jest.fn(),
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
})
