import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SpaceOutlet } from './SpaceOutlet'

const projectState = { project: null as { id: string } | null, isLoading: false, error: null }

jest.mock('@/context/project-context', () => ({
  useProject: () => projectState,
}))

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<SpaceOutlet />}>
          <Route path="/spaces/:project" element={<p>Space page</p>} />
          <Route path="/" element={<p>Home page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('SpaceOutlet', () => {
  beforeEach(() => {
    projectState.project = null
    projectState.isLoading = false
  })

  it("says a space that didn't load doesn't exist or isn't yours, with a way home", () => {
    renderAt('/spaces/payments')
    expect(screen.getByText("This space doesn't exist, or you don't have access to it")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/')
    expect(screen.queryByText('Space page')).not.toBeInTheDocument()
  })

  it('shows the page while the space loads', () => {
    projectState.isLoading = true
    renderAt('/spaces/web-shop')
    expect(screen.getByText('Space page')).toBeInTheDocument()
  })

  it('shows the page once the space has loaded', () => {
    projectState.project = { id: 's' }
    renderAt('/spaces/web-shop')
    expect(screen.getByText('Space page')).toBeInTheDocument()
  })

  it('shows pages outside a space as they are', () => {
    renderAt('/')
    expect(screen.getByText('Home page')).toBeInTheDocument()
  })
})
