import { fireEvent, render, screen } from '@testing-library/react'
import { PhaseDocumentRevisionHistory } from './phase-document-revision-history'

describe('PhaseDocumentRevisionHistory', () => {
  it('renders revision metadata and updates the selected revision', () => {
    const onSelectRevision = jest.fn()

    render(
      <PhaseDocumentRevisionHistory
        revisions={[
          {
            id: 'revision-1',
            documentId: 'doc-1',
            ticketId: 'ticket-1',
            phase: 'research',
            content: 'First revision',
            source: 'manual',
            actor: 'author@example.com',
            createdAt: '2026-03-01T09:00:00.000Z',
          },
          {
            id: 'revision-2',
            documentId: 'doc-1',
            ticketId: 'ticket-1',
            phase: 'research',
            content: 'Second revision',
            source: 'agent',
            actor: null,
            createdAt: '2026-03-01T10:00:00.000Z',
          },
        ]}
        selectedRevisionId="revision-1"
        onSelectRevision={onSelectRevision}
      />,
    )

    expect(screen.getAllByText('Manual save by author@example.com')).toHaveLength(2)
    expect(screen.getByText('First revision')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button')[1])

    expect(onSelectRevision).toHaveBeenCalledWith('revision-2')
  })
})
