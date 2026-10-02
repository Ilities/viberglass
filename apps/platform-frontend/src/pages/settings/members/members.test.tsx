import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ManagedUser } from '@/service/api/user-api'
import { InviteForm } from './invite-form'
import { MembersTable } from './members-table'

const mockCreateInvite = jest.fn()
const mockDeactivate = jest.fn()
const mockResetLink = jest.fn()

jest.mock('@/service/api/invite-api', () => ({
  createInvite: (...args: unknown[]) => mockCreateInvite(...args),
}))
jest.mock('@/service/api/user-api', () => ({
  deactivateUser: (...args: unknown[]) => mockDeactivate(...args),
  reactivateUser: jest.fn(),
  updateUserRole: jest.fn(),
  createResetLink: (...args: unknown[]) => mockResetLink(...args),
}))

const at = '2026-09-30T10:00:00.000Z'
const person = (overrides: Partial<ManagedUser>): ManagedUser => ({
  id: 'user-2',
  email: 'maria@example.com',
  name: 'Maria',
  avatarUrl: null,
  role: 'member',
  createdAt: at,
  updatedAt: at,
  deactivatedAt: null,
  ...overrides,
})

describe('InviteForm', () => {
  it('shows the one-time link after creating an invite', async () => {
    mockCreateInvite.mockResolvedValue({
      invite: { id: 'i-1', email: 'maria@example.com', role: 'member', spaceIds: [], invitedByName: 'Jussi', createdAt: at, expiresAt: at },
      path: '/invite/abc',
    })
    const onInvited = jest.fn()
    render(
      <Theme>
        <InviteForm spaces={[]} onInvited={onInvited} />
      </Theme>
    )

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'maria@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create invite link' }))

    expect(await screen.findByTestId('one-time-link')).toHaveTextContent('/invite/abc')
    expect(mockCreateInvite).toHaveBeenCalledWith('maria@example.com', 'member', [])
    expect(onInvited).toHaveBeenCalled()
  })
})

describe('InviteForm for guests', () => {
  // jsdom has no layout, and the role picker scrolls its list into view.
  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn()
  })

  const spaces = [
    { id: 'space-1', name: 'Web', isPrivate: false },
    { id: 'space-2', name: 'Payments', isPrivate: true },
  ].map((space) => ({
    ...space,
    slug: space.name.toLowerCase(),
    keyPrefix: space.name.slice(0, 3).toUpperCase(),
    ticketSystem: 'native' as const,
    credentials: { type: 'token' as const },
    autoFixEnabled: false,
    autoFixTags: [],
    customFieldMappings: {},
    defaultReviewerIds: [],
    questionReminderHours: 4,
    createdAt: at,
    updatedAt: at,
  }))

  it('asks for a space before inviting a guest, then sends the chosen ones', async () => {
    mockCreateInvite.mockResolvedValue({
      invite: { id: 'i-2', email: 'guest@example.com', role: 'guest', spaceIds: ['space-2'], invitedByName: 'Jussi', createdAt: at, expiresAt: at },
      path: '/invite/xyz',
    })
    render(
      <Theme>
        <InviteForm spaces={spaces} onInvited={jest.fn()} />
      </Theme>
    )

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'guest@example.com' } })
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(await screen.findByRole('option', { name: 'Guest' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create invite link' }))
    expect(await screen.findByText(/Pick at least one space/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /Payments/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create invite link' }))
    await waitFor(() => expect(mockCreateInvite).toHaveBeenCalledWith('guest@example.com', 'guest', ['space-2']))
  })
})

describe('MembersTable', () => {
  it('deactivates someone and offers no actions on your own row', async () => {
    mockDeactivate.mockResolvedValue(person({ deactivatedAt: at }))
    const onChanged = jest.fn()
    render(
      <Theme>
        <MembersTable
          users={[person({ id: 'user-1', name: 'Jussi', role: 'admin' }), person({})]}
          currentUserId="user-1"
          onChanged={onChanged}
          onError={jest.fn()}
        />
      </Theme>
    )

    expect(screen.getAllByRole('button', { name: 'Deactivate' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ deactivatedAt: at })))
    expect(mockDeactivate).toHaveBeenCalledWith('user-2')
  })

  it('shows a reset link once it is made', async () => {
    mockResetLink.mockResolvedValue('/reset-password/xyz')
    render(
      <Theme>
        <MembersTable users={[person({})]} currentUserId="user-1" onChanged={jest.fn()} onError={jest.fn()} />
      </Theme>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reset link' }))

    expect(await screen.findByTestId('one-time-link')).toHaveTextContent('/reset-password/xyz')
  })
})
