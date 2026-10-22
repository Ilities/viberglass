import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useProject } from '@/context/project-context'
import { getProjectJobs } from '@/data'
import type { JobListItem } from '@/data'
import { getClankers } from '@/service/api/clanker-api'
import { JobsPage } from './JobsPage'

jest.mock('@/context/project-context', () => ({ useProject: jest.fn() }))
jest.mock('@/data', () => ({ ...jest.requireActual('@/data'), getProjectJobs: jest.fn() }))
jest.mock('@/service/api/clanker-api', () => ({ getClankers: jest.fn(() => Promise.resolve([])) }))

function job(overrides: Partial<JobListItem>): JobListItem {
  return {
    jobId: 'run-1',
    jobKind: 'execution',
    status: 'completed',
    repository: 'https://github.com/example/web.git',
    task: 'Add the login page',
    tenantId: 'tenant-1',
    createdAt: '2026-09-30T10:00:00.000Z',
    processedAt: '2026-09-30T10:00:00.000Z',
    finishedAt: '2026-09-30T10:01:00.000Z',
    ticketId: null,
    clankerId: null,
    ticket: null,
    ...overrides,
  }
}

function Location() {
  const location = useLocation()
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>
}

function renderPage(initialEntry: string) {
  jest.mocked(useProject).mockReturnValue({ project: null, isLoading: false, error: null })
  return render(
    <Theme>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Location />
        <Routes>
          <Route path="/spaces/:project/runs" element={<JobsPage />} />
        </Routes>
      </MemoryRouter>
    </Theme>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  // jsdom has no layout, and the status list scrolls its options into view.
  Element.prototype.scrollIntoView = jest.fn()
  jest.mocked(getProjectJobs).mockResolvedValue([
    job({ jobId: 'run-1', task: 'Add the login page', status: 'completed' }),
    job({ jobId: 'run-2', task: 'Fix the checkout', status: 'failed' }),
  ])
  jest.mocked(getClankers).mockResolvedValue([])
})

describe('JobsPage filters', () => {
  it('puts the search in the URL once it settles', async () => {
    renderPage('/spaces/web/runs')

    fireEvent.change(await screen.findByRole('searchbox', { name: 'Search runs' }), { target: { value: 'login' } })

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('search=login'), { timeout: 2000 })
  })

  it('reads the search from the URL', async () => {
    renderPage('/spaces/web/runs?search=checkout')

    expect(await screen.findByRole('searchbox', { name: 'Search runs' })).toHaveValue('checkout')
  })

  it('puts the status in the URL', async () => {
    renderPage('/spaces/web/runs')

    fireEvent.click(await screen.findByRole('combobox', { name: 'Filter by status' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Failed' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('status=failed'))
  })

  it('reads the status from the URL', async () => {
    renderPage('/spaces/web/runs?status=failed')

    expect(await screen.findByRole('combobox', { name: 'Filter by status' })).toHaveTextContent('Failed')
  })

  it('says what went wrong when the runs cannot be loaded, and offers another try', async () => {
    jest.mocked(getProjectJobs).mockRejectedValueOnce(new Error('The server is busy')).mockResolvedValue([])
    renderPage('/spaces/web/runs')

    expect(await screen.findByText('The server is busy')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('No runs found for this space.')).toBeInTheDocument()
  })
})
