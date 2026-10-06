import { fireEvent, render, screen } from '@testing-library/react'
import { DocumentVersion } from './document-version'

const mockRevisions = jest.fn()
jest.mock('@/service/api/ticket-api', () => ({
  getPhaseDocumentRevisions: (...args: unknown[]) => mockRevisions(...args),
}))
jest.mock('@/hooks/usePeople', () => ({ usePersonName: () => (actor: string | null) => (actor === 'u-1' ? 'Maria' : null) }))

function revision(version: number, content: string, source: 'agent' | 'manual' = 'agent') {
  return {
    id: `r-${version}`,
    documentId: 'd-1',
    ticketId: 't-1',
    phase: 'planning',
    content,
    source,
    actor: source === 'manual' ? 'u-1' : null,
    version,
    createdAt: `2026-10-0${version}T10:00:00Z`,
  }
}

describe('DocumentVersion', () => {
  beforeEach(() => {
    mockRevisions.mockResolvedValue([revision(2, '# Greeting\n\nReturn Welcome to Acme.', 'manual'), revision(1, '# Greeting\n\nReturn hello.')])
  })

  it('shows the version it was opened at, not the current text', async () => {
    render(<DocumentVersion ticketId="t-1" step="planning" version={1} onShowCurrent={jest.fn()} />)

    expect(await screen.findByText('Return hello.')).toBeInTheDocument()
    expect(screen.queryByText('Return Welcome to Acme.')).not.toBeInTheDocument()
    expect(screen.getByText('Older · current is v2')).toBeInTheDocument()
    expect(screen.getByText(/Written by the agent/)).toBeInTheDocument()
  })

  it('compares an older version with the current one', async () => {
    render(<DocumentVersion ticketId="t-1" step="planning" version={1} onShowCurrent={jest.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Compare with current' }))
    expect(screen.getByText('Return hello.')).toHaveClass('line-through', { exact: false })
    expect(screen.getByText('Return Welcome to Acme.')).toBeInTheDocument()
  })

  it('names who edited a version, and leads back to the current document', async () => {
    const onShowCurrent = jest.fn()
    render(<DocumentVersion ticketId="t-1" step="planning" version={2} onShowCurrent={onShowCurrent} />)

    expect(await screen.findByText(/Edited by Maria/)).toBeInTheDocument()
    expect(screen.getByText('Current')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Comment or edit' }))
    expect(onShowCurrent).toHaveBeenCalled()
  })

  it("says so when the version doesn't exist", async () => {
    render(<DocumentVersion ticketId="t-1" step="planning" version={7} onShowCurrent={jest.fn()} />)
    expect(await screen.findByText("Plan v7 isn't available.")).toBeInTheDocument()
  })
})
