import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { TaskCapabilities, Ticket } from '@viberglass/types'
import { TaskStepView } from './task-step-view'
import type { TaskPageData } from './use-task-page'

let mockRole = 'viewer'
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', role: mockRole } }) }))
jest.mock('@/service/api/ticket-api', () => ({ getPhaseDocumentComments: jest.fn().mockResolvedValue([]) }))

const TICKET: Ticket = {
  id: 't-1',
  key: 'STO-1',
  projectId: 'p-1',
  timestamp: '',
  title: 'Greeting',
  description: '',
  severity: 'medium',
  category: 'general',
  status: 'open',
  workflowPhase: 'research',
  metadata: { timestamp: '', timezone: 'UTC' },
  annotations: [],
  ticketSystem: 'custom',
  autoFixRequested: false,
  createdAt: '',
  updatedAt: '',
}

const READ_ONLY: TaskCapabilities = { canPost: false, canAsk: false, canAskForCode: false, canSteer: false, canEdit: false, canDelete: false }
const emptyDocument = (phase: 'research' | 'planning') => ({ id: phase, ticketId: 't-1', phase, content: '', createdAt: '', updatedAt: '' })

function renderStep(step: 'research' | 'execution', capabilities: TaskCapabilities) {
  const data: TaskPageData = {
    ticket: TICKET,
    clankers: [],
    runs: [],
    documents: { research: emptyDocument('research'), planning: emptyDocument('planning') },
    newComments: { research: 0, planning: 0 },
    sessions: [],
    capabilities,
  }
  render(
    <MemoryRouter>
      <TaskStepView
        step={step}
        view="document"
        onCompare={jest.fn()}
        onView={jest.fn()}
        data={data}
        move={{ kind: 'start', step: 'research' }}
        onDocumentSaved={jest.fn()}
        onNewComments={jest.fn()}
      />
    </MemoryRouter>
  )
}

describe('TaskStepView empty artifacts', () => {
  it("never tells a viewer to ask, write or build what they can't", () => {
    mockRole = 'viewer'
    renderStep('research', READ_ONLY)
    expect(screen.getByText(/People on this task can ask the agent for it/)).toBeInTheDocument()
    expect(screen.queryByText(/Ask the agent for it in the thread/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Write it yourself' })).not.toBeInTheDocument()
  })

  it('tells someone who can ask how to get it', () => {
    mockRole = 'member'
    renderStep('research', { ...READ_ONLY, canPost: true, canAsk: true })
    expect(screen.getByText(/Ask the agent for it in the thread, or write it yourself/)).toBeInTheDocument()
  })

  it("doesn't offer a build to someone who can't ask for code", () => {
    mockRole = 'viewer'
    renderStep('execution', READ_ONLY)
    expect(screen.getByText(/People who can ask for code on this task can have the agent build it/)).toBeInTheDocument()
  })
})
