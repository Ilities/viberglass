import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { getOverview } from '@/service/api/home-api'
import { SpaceSummary } from './SpaceSummary'

jest.mock('@/context/project-context', () => ({ useProject: () => ({ project: null }) }))
jest.mock('@/service/api/home-api', () => ({ getOverview: jest.fn() }))

function renderPage(url: string) {
  return render(<Theme><MemoryRouter initialEntries={[url]}><Routes>
    <Route path="/spaces/:project" element={<SpaceSummary />} />
    <Route path="/spaces/:project/tasks" element={<p>Existing task browser</p>} />
  </Routes></MemoryRouter></Theme>)
}

it('shows the space summary and keeps the full task browser reachable', async () => {
  jest.mocked(getOverview).mockResolvedValue({ needsAttention: [], liveNow: [], waiting: [], notStarted: [], doneThisWeek: [], spaces: [] })
  renderPage('/spaces/web')
  expect(await screen.findByText('Decisions, conversations, and work in this space.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Browse all tasks' })).toHaveAttribute('href', '/spaces/web/tasks')
  expect(getOverview).toHaveBeenCalledWith('web')
})

it('preserves links to the old filtered task browser', async () => {
  renderPage('/spaces/web?archived=1')
  expect(await screen.findByText('Existing task browser')).toBeInTheDocument()
})
