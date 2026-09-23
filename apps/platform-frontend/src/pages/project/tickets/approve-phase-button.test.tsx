import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getPhaseDocumentComments, type PhaseDocumentCommentResponse } from '@/service/api/ticket-api'
import { ApprovePhaseButton } from './approve-phase-button'

jest.mock('@/service/api/ticket-api', () => ({ getPhaseDocumentComments: jest.fn() }))

const mockGetComments = jest.mocked(getPhaseDocumentComments)

function renderButton(props: { runInProgress?: boolean; onApprove?: () => void } = {}) {
  const onApprove = props.onApprove ?? jest.fn()
  render(
    <Theme>
      <ApprovePhaseButton
        ticketId="ticket-1"
        phase="research"
        label="Approve Research & Continue"
        runInProgress={props.runInProgress ?? false}
        isApproving={false}
        onApprove={onApprove}
      />
    </Theme>,
  )
  return onApprove
}

function comment(status: 'open' | 'resolved'): PhaseDocumentCommentResponse {
  return {
    id: `comment-${status}`,
    documentId: 'document-1',
    ticketId: 'ticket-1',
    phase: 'research',
    lineNumber: 90,
    content: 'Confirmed: light theme plus follow system',
    status,
    actor: 'maria.pm@example.com',
    resolvedAt: null,
    resolvedBy: null,
    createdAt: '2026-09-23T08:49:46.000Z',
    updatedAt: '2026-09-23T08:49:46.000Z',
  }
}

describe('ApprovePhaseButton', () => {
  beforeEach(() => jest.clearAllMocks())

  it('approves straight away when there is no open feedback', async () => {
    mockGetComments.mockResolvedValue([comment('resolved')])
    const onApprove = renderButton()

    fireEvent.click(screen.getByRole('button', { name: /approve research/i }))

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/approve with open feedback/i)).not.toBeInTheDocument()
  })

  it('warns about unresolved comments before approving', async () => {
    mockGetComments.mockResolvedValue([comment('open')])
    const onApprove = renderButton()

    fireEvent.click(screen.getByRole('button', { name: /approve research/i }))

    expect(await screen.findByText(/1 comment is still unresolved/i)).toBeInTheDocument()
    expect(onApprove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /approve anyway/i }))
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it('warns while the agent is still working on the document', async () => {
    mockGetComments.mockResolvedValue([])
    const onApprove = renderButton({ runInProgress: true })

    fireEvent.click(screen.getByRole('button', { name: /approve research/i }))

    expect(await screen.findByText(/agent is still working/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /not yet/i }))
    expect(onApprove).not.toHaveBeenCalled()
  })
})
