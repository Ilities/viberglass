import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/context/auth-context'
import { WorkspaceSettingsLayout } from './WorkspaceSettingsLayout'

jest.mock('@/context/auth-context', () => ({ useAuth: jest.fn() }))

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

function renderAs(role: 'admin' | 'member' | 'guest', path: string) {
  mockedUseAuth.mockReturnValue({
    user: { id: 'u1', email: 'a@example.com', name: 'A', role },
    status: 'authenticated',
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    adoptSession: jest.fn(),
  })
  render(
    <Theme>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<WorkspaceSettingsLayout />}>
            <Route path="/settings" element={<div>Settings home</div>} />
            <Route path="*" element={<div>Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Theme>,
  )
}

describe('WorkspaceSettingsLayout', () => {
  it('shows admins the workspace and the plumbing under Advanced', () => {
    renderAs('admin', '/settings/agents/default-agent')

    expect(screen.getByRole('heading', { name: 'Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Advanced' })).toBeInTheDocument()
    for (const name of ['Members', 'API tokens', 'Agents', 'MCP servers', 'Skills', 'Connections', 'Secrets', 'Prompt templates']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Agents' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows members only what they can use', () => {
    renderAs('member', '/settings/api-tokens')

    expect(screen.getByRole('link', { name: 'API tokens' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Advanced' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Secrets' })).not.toBeInTheDocument()
  })

  it('sends members away from admin pages instead of opening them to fail', () => {
    renderAs('member', '/settings/secrets')

    expect(screen.getByText('Settings home')).toBeInTheDocument()
  })

  it('gives guests notifications only', () => {
    renderAs('guest', '/settings/notifications')

    expect(screen.getByRole('link', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'API tokens' })).not.toBeInTheDocument()
  })
})
