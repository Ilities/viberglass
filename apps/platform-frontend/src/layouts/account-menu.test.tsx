import { Theme, DropdownMenu } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthUser } from '@/service/api/auth-api'
import type { WorkspaceRole } from '@viberglass/types'
import { AccountMenu } from './account-menu'

jest.mock('@/context/theme-context', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: jest.fn() }) }))

function renderMenu(role: WorkspaceRole) {
  const user: AuthUser = { id: 'u', name: 'Maria Product', email: 'm@x', role }
  render(
    <Theme>
      <MemoryRouter>
        <DropdownMenu.Root open>
          <DropdownMenu.Trigger>
            <button type="button">Account</button>
          </DropdownMenu.Trigger>
          <AccountMenu user={user} onSignOut={jest.fn()} />
        </DropdownMenu.Root>
      </MemoryRouter>
    </Theme>
  )
}

describe('AccountMenu', () => {
  it("gives admins the workspace's settings next to their own", () => {
    renderMenu('admin')
    expect(screen.getByRole('menuitem', { name: 'Workspace settings' })).toHaveAttribute('href', '/settings/members')
    expect(screen.getByRole('menuitem', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('keeps everyone else to their own settings', () => {
    renderMenu('member')
    expect(screen.queryByRole('menuitem', { name: 'Workspace settings' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Notifications' })).toHaveAttribute('href', '/settings/notifications')
  })
})
