import { Theme } from '@radix-ui/themes'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AgentTrackRecordTask, Project } from '@viberglass/types'
import { useProject } from '@/context/project-context'
import { getAgentTrackRecord } from '@/service/api/agent-track-record-api'
import { TrackRecordPage } from './TrackRecordPage'

jest.mock('@/context/project-context', () => ({ useProject: jest.fn() }))
jest.mock('@/service/api/agent-track-record-api', () => ({ getAgentTrackRecord: jest.fn() }))

const SPACE: Project = {
  backingKind: 'git',
  id: 'space-1',
  name: 'Web',
  slug: 'web',
  ticketSystem: 'custom',
  autoFixEnabled: false,
  autoFixTags: [],
  customFieldMappings: {},
  isPrivate: false,
  keyPrefix: 'WEB',
  defaultReviewerIds: [],
  questionReminderHours: 4,
  createdAt: '',
  updatedAt: '',
}

function task(index: number): AgentTrackRecordTask {
  return {
    ticketId: `t-${index}`,
    key: `WEB-${index}`,
    title: 'Task',
    pullRequest: 'merged',
    built: true,
    planRounds: 1,
    questions: 0,
    takenOver: false,
    runs: 1,
    failedRuns: 0,
    reviewComments: 1,
    costUsd: 2,
    costEstimated: false,
  }
}

function renderPage() {
  jest.mocked(useProject).mockReturnValue({ project: SPACE, isLoading: false, error: null })
  jest.mocked(getAgentTrackRecord).mockResolvedValue({
    entries: [
      { agent: 'claude-code', model: 'glm-5.3', tasks: [1, 2, 3, 4, 5].map(task) },
      { agent: 'claude-code', model: 'kimi-k2', tasks: [task(6)] },
    ],
  })
  render(
    <Theme>
      <MemoryRouter initialEntries={['/spaces/web/track-record']}>
        <Routes>
          <Route path="/spaces/:project/track-record" element={<TrackRecordPage />} />
        </Routes>
      </MemoryRouter>
    </Theme>
  )
}

describe('TrackRecordPage', () => {
  afterEach(() => Reflect.deleteProperty(window, 'matchMedia'))

  it('shows a table of the agents on a wide screen', async () => {
    renderPage()

    expect(await screen.findByRole('table')).toHaveTextContent('Built from first plan')
    expect(screen.queryByRole('list', { name: "Agents' track record" })).not.toBeInTheDocument()
  })

  it('shows a card per agent with its numbers on a phone-width screen', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query === '(max-width: 639px)', addEventListener: jest.fn(), removeEventListener: jest.fn() }),
    })
    renderPage()

    const cards = within(await screen.findByRole('list', { name: "Agents' track record" })).getAllByRole('listitem')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(cards[0]).toHaveTextContent('glm-5.3')
    expect(cards[0]).toHaveTextContent('Tasks5')
    expect(cards[0]).toHaveTextContent('Merged5 of 5')
    expect(cards[0]).toHaveTextContent('Cost per merge$2.00')
    expect(within(cards[0]).getByRole('link')).toHaveAttribute('href', expect.stringContaining('agent=claude-code%3Aglm-5.3'))
    expect(cards[1]).toHaveTextContent('Too few tasks to say (needs 5)')
  })
})
