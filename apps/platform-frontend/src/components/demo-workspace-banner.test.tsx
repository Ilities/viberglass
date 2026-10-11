import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { getSetupStatus } from '@/service/api/setup-api'
import { DemoWorkspaceBanner } from './demo-workspace-banner'

jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ status: 'authenticated', user: { id: 'a', role: 'admin' } }) }))
jest.mock('@/service/api/setup-api', () => ({
  getSetupStatus: jest.fn().mockResolvedValue({ demo: { name: 'Demo: Acme storefront', slug: 'demo', projectId: 'p' } }),
  removeDemoWorkspace: jest.fn(),
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DemoWorkspaceBanner />
    </MemoryRouter>
  )
}

describe('DemoWorkspaceBanner', () => {
  beforeEach(() => window.localStorage.clear())

  it('explains the sample data inside the demo space, and offers no way to hide it there', async () => {
    renderAt('/spaces/demo/tasks/DAS-1')
    expect(await screen.findByText(/Its tasks don't run agents/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide' })).not.toBeInTheDocument()
  })

  it('stays out of real work, and can be hidden on Home', async () => {
    const { unmount } = renderAt('/spaces/storefront/tasks/STO-7')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    unmount()

    const home = renderAt('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Hide' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    home.unmount()

    renderAt('/')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('finds the demo loaded from setup once the person leaves setup', async () => {
    const status = jest.mocked(getSetupStatus)
    status.mockClear()
    function LeaveSetup() {
      const navigate = useNavigate()
      return <button onClick={() => navigate('/spaces/demo')}>Explore</button>
    }
    render(
      <MemoryRouter initialEntries={['/setup']}>
        <LeaveSetup />
        <DemoWorkspaceBanner />
      </MemoryRouter>
    )
    expect(status).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    expect(await screen.findByText(/Its tasks don't run agents/)).toBeInTheDocument()
  })
})
