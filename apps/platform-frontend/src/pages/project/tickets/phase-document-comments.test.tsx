import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PhaseDocumentComments } from './phase-document-comments'

const mockGetPhaseDocumentComments = jest.fn()
const mockCreatePhaseDocumentComment = jest.fn()
const mockUpdatePhaseDocumentComment = jest.fn()

jest.mock('@/service/api/ticket-api', () => ({
  getPhaseDocumentComments: (...args: unknown[]) => mockGetPhaseDocumentComments(...args),
  createPhaseDocumentComment: (...args: unknown[]) => mockCreatePhaseDocumentComment(...args),
  updatePhaseDocumentComment: (...args: unknown[]) => mockUpdatePhaseDocumentComment(...args),
}))

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

describe('PhaseDocumentComments', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('loads comments, supports new comments, and resolves threads by line', async () => {
    mockGetPhaseDocumentComments
      .mockResolvedValueOnce([
        {
          id: 'comment-1',
          documentId: 'doc-1',
          ticketId: 'ticket-1',
          phase: 'research',
          lineNumber: 2,
          content: 'Please add an example.',
          status: 'open',
          actor: 'reviewer@example.com',
          resolvedAt: null,
          resolvedBy: null,
          createdAt: '2026-03-01T09:00:00.000Z',
          updatedAt: '2026-03-01T09:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'comment-1',
          documentId: 'doc-1',
          ticketId: 'ticket-1',
          phase: 'research',
          lineNumber: 2,
          content: 'Please add an example.',
          status: 'open',
          actor: 'reviewer@example.com',
          resolvedAt: null,
          resolvedBy: null,
          createdAt: '2026-03-01T09:00:00.000Z',
          updatedAt: '2026-03-01T09:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'comment-1',
          documentId: 'doc-1',
          ticketId: 'ticket-1',
          phase: 'research',
          lineNumber: 2,
          content: 'Please add an example.',
          status: 'resolved',
          actor: 'reviewer@example.com',
          resolvedAt: '2026-03-01T09:05:00.000Z',
          resolvedBy: 'reviewer@example.com',
          createdAt: '2026-03-01T09:00:00.000Z',
          updatedAt: '2026-03-01T09:05:00.000Z',
        },
      ])

    render(<PhaseDocumentComments ticketId="ticket-1" phase="research" content={`Intro\nDetails`} />)

    await waitFor(() => {
      expect(mockGetPhaseDocumentComments).toHaveBeenCalledWith('ticket-1', 'research')
    })

    await screen.findByText('1 open')
    fireEvent.click(screen.getByRole('button', { name: /2 details 1 open/i }))
    expect(screen.getByText('Please add an example.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /1 intro/i }))
    fireEvent.change(screen.getByPlaceholderText('Comment on line 1...'), {
      target: { value: 'Add context here.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }))

    await waitFor(() => {
      expect(mockCreatePhaseDocumentComment).toHaveBeenCalledWith('ticket-1', 'research', {
        lineNumber: 1,
        content: 'Add context here.',
      })
    })

    fireEvent.click(screen.getByRole('button', { name: /2 details 1 open/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))

    await waitFor(() => {
      expect(mockUpdatePhaseDocumentComment).toHaveBeenCalledWith('ticket-1', 'research', 'comment-1', {
        status: 'resolved',
      })
    })
  })
})
