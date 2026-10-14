import { act, renderHook, waitFor } from '@testing-library/react'
import type { PhaseDocumentCommentResponse } from '@/service/api/ticket-api'
import { useDocumentComments } from './document-comments'
import { encodeSuggestion } from './phase-document-comment-entry'

const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockList = jest.fn()
jest.mock('@/service/api/ticket-api', () => ({
  getPlanComments: (...args: unknown[]) => mockList(...args),
  createPlanComment: (...args: unknown[]) => mockCreate(...args),
  updatePlanComment: (...args: unknown[]) => mockUpdate(...args),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const QUOTE = { exact: 'short on mobile', prefix: '', suffix: '' }

describe('useDocumentComments', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockList.mockResolvedValue([])
  })

  it('tells the page when a comment or a suggestion is added, so the thread shows it', async () => {
    mockCreate.mockResolvedValue({})
    const onChanged = jest.fn()
    const { result } = renderHook(() => useDocumentComments('t-1', true, onChanged))
    await waitFor(() => expect(mockList).toHaveBeenCalled())

    await act(async () => {
      await result.current.add(QUOTE, 'Keep it short.')
      await result.current.add(QUOTE, encodeSuggestion('short everywhere'))
    })

    expect(onChanged).toHaveBeenCalledTimes(2)
  })

  it('tells the page when a comment is resolved, and not when saving fails', async () => {
    mockUpdate.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Nope'))
    const onChanged = jest.fn()
    const { result } = renderHook(() => useDocumentComments('t-1', true, onChanged))
    const comment: PhaseDocumentCommentResponse = {
      id: 'c-1',
      documentId: 'd-1',
      ticketId: 't-1',
      lineNumber: 1,
      quote: QUOTE,
      location: null,
      outdated: false,
      content: 'Keep it short.',
      status: 'open',
      actor: null,
      resolvedAt: null,
      resolvedBy: null,
      createdAt: '2026-10-01T10:09:00Z',
      updatedAt: '2026-10-01T10:09:00Z',
    }

    await act(async () => {
      await result.current.toggleStatus(comment)
      await result.current.toggleStatus(comment)
    })

    expect(onChanged).toHaveBeenCalledTimes(1)
  })
})
