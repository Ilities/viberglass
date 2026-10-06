import { render, screen } from '@testing-library/react'
import { PlanPartsOutline } from './plan-parts-outline'

describe('PlanPartsOutline', () => {
  it('lists a plan’s parts in order', () => {
    render(<PlanPartsOutline plan={'# Plan\n\n## Part 1: Store the note\nA.\n\n## Part 2: Show it on the slip\nB.'} />)

    expect(screen.getByRole('navigation', { name: 'Parts' })).toHaveTextContent('Built in 2 parts, one pull request each')
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Part 1 · Store the note',
      'Part 2 · Show it on the slip',
    ])
  })

  it('shows nothing for a plan that is one part', () => {
    const { container } = render(<PlanPartsOutline plan={'# Plan\n\n1. Fix the rounding.'} />)
    expect(container).toBeEmptyDOMElement()
  })
})
