import { Theme } from '@radix-ui/themes'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TICKET_WORKFLOW_PHASE } from '@viberglass/types'
import { TicketWorkflowPanel } from './ticket-workflow-panel'

function renderPanel(
  workflowPhase: 'research' | 'planning' | 'execution',
  onAdvance?: (phase: 'research' | 'planning' | 'execution') => Promise<void>,
  isAdvancing?: boolean
) {
  return render(
    <Theme>
      <TicketWorkflowPanel
        workflowPhase={workflowPhase}
        onAdvance={onAdvance ?? jest.fn()}
        isAdvancing={isAdvancing}
      />
    </Theme>
  )
}

describe('TicketWorkflowPanel', () => {
  it('renders all three phases in order', () => {
    renderPanel(TICKET_WORKFLOW_PHASE.RESEARCH)

    const headings = screen.getAllByRole('heading', { level: 3 })
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Workflow',
      'Research',
      'Planning',
      'Execution',
    ])
  })

  it('marks research as current and shows move to planning', () => {
    renderPanel(TICKET_WORKFLOW_PHASE.RESEARCH)

    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move to Planning' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move to Execution' })).toBeNull()
  })

  it('marks planning as current and shows move to execution', () => {
    renderPanel(TICKET_WORKFLOW_PHASE.PLANNING)

    expect(screen.getByRole('button', { name: 'Move to Execution' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move to Planning' })).toBeNull()
  })

  it('hides advance action in execution', () => {
    renderPanel(TICKET_WORKFLOW_PHASE.EXECUTION)

    expect(screen.queryByRole('button', { name: /Move to/ })).toBeNull()
  })

  it('calls onAdvance with the next workflow phase', async () => {
    const onAdvance = jest.fn().mockResolvedValue(undefined)
    renderPanel(TICKET_WORKFLOW_PHASE.RESEARCH, onAdvance)

    await userEvent.click(screen.getByRole('button', { name: 'Move to Planning' }))

    await waitFor(() => {
      expect(onAdvance).toHaveBeenCalledWith(TICKET_WORKFLOW_PHASE.PLANNING)
    })
  })

  it('shows disabled updating state when advancing is in progress', () => {
    renderPanel(TICKET_WORKFLOW_PHASE.PLANNING, jest.fn(), true)

    expect(screen.getByRole('button', { name: 'Updating...' })).toBeDisabled()
  })
})
