import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TaskPlanParts } from '@viberglass/types'
import { PlanPartsOutline } from './plan-parts-outline'

const mockAsk = jest.fn()
jest.mock('@/service/api/discussion-api', () => ({ askAgent: (...args: unknown[]) => mockAsk(...args) }))

const PLAN = '# Plan\n\n## Part 1: Store the note\nA.\n\n## Part 2: Show it on the slip\nB.\n\n## Part 3: Email it\nC.'
const PART_ONE_MERGED: TaskPlanParts = {
  parts: [
    { number: 1, title: 'Store the note', status: 'merged', pullRequestUrl: 'https://github.com/acme/app/pull/7' },
    { number: 2, title: 'Show it on the slip', status: 'not_built', pullRequestUrl: null },
    { number: 3, title: 'Email it', status: 'not_built', pullRequestUrl: null },
  ],
  open: null,
  next: 2,
}

function outline(props: Partial<Parameters<typeof PlanPartsOutline>[0]> = {}) {
  const onAsked = jest.fn()
  render(<PlanPartsOutline plan={PLAN} state={PART_ONE_MERGED} ticketId="t-1" canBuild onAsked={onAsked} {...props} />)
  return onAsked
}

describe('PlanPartsOutline', () => {
  beforeEach(() => mockAsk.mockReset())

  it('lists a plan’s parts in order, with where each stands', () => {
    outline()

    expect(screen.getByRole('navigation', { name: 'Parts' })).toHaveTextContent('Built in 3 parts, one pull request each')
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Part 1 · Store the noteMerged')
    expect(items[1]).toHaveTextContent('Part 2 · Show it on the slipNot built')
    expect(screen.getByRole('link', { name: "Part 1's pull request" })).toHaveAttribute('href', 'https://github.com/acme/app/pull/7')
  })

  it('offers to build the next part, and asks the agent for just that part', async () => {
    const onAsked = outline()

    fireEvent.click(screen.getByRole('button', { name: 'Build part 2' }))

    await waitFor(() => expect(onAsked).toHaveBeenCalled())
    expect(mockAsk).toHaveBeenCalledWith('t-1', { action: 'code', body: 'Build part 2', parts: { first: 2, last: 2 } })
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('offers no build while a part’s pull request is open, or to someone who may not ask for code', () => {
    outline({ state: { ...PART_ONE_MERGED, open: { first: 2, last: 2 }, next: null } })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers no build to someone who may not ask for code', () => {
    outline({ canBuild: false })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows nothing for a plan that is one part', () => {
    const { container } = render(<PlanPartsOutline plan={'# Plan\n\n1. Fix the rounding.'} state={null} ticketId="t-1" canBuild onAsked={jest.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
