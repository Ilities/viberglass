import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Project } from '@viberglass/types'
import { spaceCapabilities } from '@viberglass/types'
import { useProject } from '@/context/project-context'
import { useJobStatus } from '@/hooks/useJobStatus'
import type { JobStatus } from '@/service/api/job-api'
import { JobDetailPage } from './JobDetailPage'
import { useRunContext } from './use-run-context'

jest.mock('@/context/project-context', () => ({ useProject: jest.fn() }))
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: null }) }))
jest.mock('@/hooks/useJobStatus', () => ({ useJobStatus: jest.fn() }))
jest.mock('./use-run-context', () => ({ useRunContext: jest.fn(), findNewerRun: jest.fn(() => null) }))
jest.mock('./run-activity', () => ({ RunActivity: () => <div>Activity view</div> }))
jest.mock('./run-prompt', () => ({ RunPrompt: () => <div>Prompt view</div> }))
jest.mock('./run-log', () => ({ RunLog: () => <div>Log view</div> }))
jest.mock('./run-record-panel', () => ({ RunRecordPanel: () => <div>Record view</div> }))

const SPACE: Project = {
  backingKind: 'git',
  id: 'space-1',
  name: 'Web shop',
  slug: 'web',
  ticketSystem: 'custom',
  credentials: { type: 'token' },
  autoFixEnabled: false,
  autoFixTags: [],
  customFieldMappings: {},
  isPrivate: false,
  keyPrefix: 'WEB',
  defaultReviewerIds: [],
  questionReminderHours: 4,
  viewerAccess: spaceCapabilities('admin', 'maintainer'),
  createdAt: '',
  updatedAt: '',
}

const JOB: JobStatus = {
  jobId: 'run-1',
  jobKind: 'execution',
  status: 'completed',
  progress: null,
  lastHeartbeat: null,
  progressUpdates: [],
  logs: [],
  data: {
    id: 'run-1',
    jobKind: 'execution',
    tenantId: 'tenant-1',
    repository: '',
    task: 't-1',
    branch: null,
    baseBranch: null,
    context: null,
    settings: null,
    timestamp: 0,
  },
  result: { success: true },
  failedReason: null,
  createdAt: '2026-09-30T10:00:00.000Z',
  processedAt: '2026-09-30T10:00:00.000Z',
  finishedAt: '2026-09-30T10:01:00.000Z',
  ticketId: null,
  ticket: null,
  agentSessionId: null,
  clankerId: null,
  clanker: null,
}

function Location() {
  const location = useLocation()
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>
}

function renderPage(entry: string) {
  jest.mocked(useProject).mockReturnValue({ project: SPACE, isLoading: false, error: null })
  jest.mocked(useJobStatus).mockReturnValue({
    job: JOB,
    isLoading: false,
    error: null,
    isPolling: false,
    refetch: jest.fn(),
  })
  jest.mocked(useRunContext).mockReturnValue({
    ticket: null,
    taskRuns: [],
    document: null,
    clankers: [],
    reload: jest.fn(),
  })

  return render(
    <Theme>
      <MemoryRouter initialEntries={[entry]}>
        <Location />
        <Routes>
          <Route path="/spaces/:project/runs/:jobId" element={<JobDetailPage />} />
        </Routes>
      </MemoryRouter>
    </Theme>
  )
}

describe('JobDetailPage', () => {
  it('keeps the view in the URL, so a run can be linked to', async () => {
    renderPage('/spaces/web/runs/run-1')

    fireEvent.click(await screen.findByRole('button', { name: 'Activity' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('runTab=activity'))
    expect(screen.getByText('Activity view')).toBeInTheDocument()
  })

  it('opens the view the URL asks for', async () => {
    renderPage('/spaces/web/runs/run-1?runTab=prompt')

    expect(await screen.findByText('Prompt view')).toBeInTheDocument()
  })

  it('opens on the log when the URL says nothing', async () => {
    renderPage('/spaces/web/runs/run-1')

    expect(await screen.findByText('Log view')).toBeInTheDocument()
  })
})
