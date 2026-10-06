import { render, screen } from '@testing-library/react'
import { HandoffCard } from './handoff-card'

describe('HandoffCard', () => {
  it('shows the moves on offer beside the card', () => {
    render(
      <HandoffCard owner="you" eyebrow="Your move · plan ready" title="Read the plan" actions={<button>Approve</button>}>
        Preview
      </HandoffCard>
    )

    expect(screen.getByRole('region', { name: 'Your move · plan ready' })).toHaveTextContent('Read the plan')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('drops the moves column when every move is conditional and none applies', () => {
    const fixApplies = false
    const { container } = render(
      <HandoffCard
        owner="problem"
        eyebrow="Run failed"
        title="Agent failed"
        actions={
          <>
            {fixApplies && <button>Fix</button>}
            {null}
          </>
        }
      />
    )

    expect(container.querySelectorAll('section > div')).toHaveLength(1)
  })
})
