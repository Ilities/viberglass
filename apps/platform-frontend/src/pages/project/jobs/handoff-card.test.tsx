import { render, screen } from '@testing-library/react'
import { HandoffCard } from './handoff-card'

describe('HandoffCard', () => {
  it('shows the moves on offer beside the card', () => {
    render(
      <HandoffCard owner="you" eyebrow="Your move · research ready" title="Review the research" actions={<button>Approve</button>}>
        Preview
      </HandoffCard>
    )

    expect(screen.getByRole('region', { name: 'Your move · research ready' })).toHaveTextContent('Review the research')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('drops the moves column when every move is conditional and none applies', () => {
    const { container } = render(
      <HandoffCard
        owner="problem"
        eyebrow="Run failed"
        title="Agent failed"
        actions={
          <>
            {false && <button>Fix</button>}
            {null}
          </>
        }
      />
    )

    expect(container.querySelectorAll('section > div')).toHaveLength(1)
  })
})
