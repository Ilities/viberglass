import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import type { TaskPlanParts } from '@viberglass/types'
import { PlanPartsOutline } from './plan-parts-outline'

const mockAsk = jest.fn()
const mockMark = jest.fn()
const mockUnmark = jest.fn()
const mockDiscard = jest.fn()
jest.mock('@/service/api/discussion-api', () => ({ askAgent: (...args: unknown[]) => mockAsk(...args) }))
jest.mock('@/service/api/build-api', () => ({
  markPlanPart: (...args: unknown[]) => mockMark(...args),
  unmarkPlanPart: (...args: unknown[]) => mockUnmark(...args),
  discardBuild: (...args: unknown[]) => mockDiscard(...args),
}))

const PLAN = '# Plan\n\n## Part 1: Store the note\nA.\n\n## Part 2: Show it on the slip\nB.\n\n## Part 3: Email it\nC.'
const PART_ONE_MERGED: TaskPlanParts = {
  parts: [
    { number: 1, title: 'Store the note', status: 'merged', pullRequestUrl: 'https://github.com/acme/app/pull/7' },
    { number: 2, title: 'Show it on the slip', status: 'not_built', pullRequestUrl: null },
    { number: 3, title: 'Email it', status: 'not_built', pullRequestUrl: null },
  ],
  open: null,
  addable: null,
  next: 2,
}

function outline(props: Partial<Parameters<typeof PlanPartsOutline>[0]> = {}) {
  const onChanged = jest.fn()
  render(
    <Theme>
      <PlanPartsOutline plan={PLAN} state={PART_ONE_MERGED} ticketId="t-1" canBuild canChange={false} onChanged={onChanged} {...props} />
    </Theme>
  )
  return onChanged
}

describe('PlanPartsOutline', () => {
  beforeEach(() => [mockAsk, mockMark, mockUnmark, mockDiscard].forEach((mock) => mock.mockReset()))

  it('lists a plan’s parts in order, with where each stands', () => {
    outline()

    expect(screen.getByRole('navigation', { name: 'Parts' })).toHaveTextContent('Built in 3 parts, one pull request each')
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Part 1 · Store the noteMerged')
    expect(items[1]).toHaveTextContent('Part 2 · Show it on the slipNot built')
    expect(screen.getByRole('link', { name: "Part 1's pull request" })).toHaveAttribute('href', 'https://github.com/acme/app/pull/7')
  })

  it('stops saying one pull request each once parts share one', () => {
    const shared = 'https://github.com/acme/app/pull/7'
    outline({
      state: {
        ...PART_ONE_MERGED,
        parts: PART_ONE_MERGED.parts.map((part) => (part.number === 2 ? { ...part, status: 'merged', pullRequestUrl: shared } : part)),
        next: 3,
      },
    })
    expect(screen.getByRole('navigation', { name: 'Parts' })).toHaveTextContent('Built in 3 parts')
    expect(screen.getByRole('navigation', { name: 'Parts' })).not.toHaveTextContent('one pull request each')
  })

  it('offers to build the next part, and asks the agent for just that part', async () => {
    const onAsked = outline()

    fireEvent.click(screen.getByRole('button', { name: 'Build part 2' }))

    await waitFor(() => expect(onAsked).toHaveBeenCalled())
    expect(mockAsk).toHaveBeenCalledWith('t-1', { action: 'code', body: 'Build part 2', parts: { first: 2, last: 2 } })
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('offers no build while a part’s pull request is open, or to someone who may not ask for code', () => {
    outline({ state: { ...PART_ONE_MERGED, open: { first: 2, last: 2 }, addable: 3, next: null }, canBuild: false })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers no build to someone who may not ask for code', () => {
    outline({ canBuild: false })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows nothing for a plan that is one part', () => {
    const { container } = render(<PlanPartsOutline plan={'# Plan\n\n1. Fix the rounding.'} state={null} ticketId="t-1" canBuild canChange onChanged={jest.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('adds the next part to the open pull request', async () => {
    const onChanged = outline({
      state: {
        ...PART_ONE_MERGED,
        parts: PART_ONE_MERGED.parts.map((part) => (part.number === 2 ? { ...part, status: 'open', pullRequestUrl: 'https://github.com/acme/app/pull/8' } : part)),
        open: { first: 2, last: 2 },
        addable: 3,
        next: null,
      },
    })

    fireEvent.click(screen.getByRole('button', { name: "Add to part 2’s pull request" }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(mockAsk).toHaveBeenCalledWith('t-1', {
      action: 'code',
      body: 'Add part 3 to the open pull request',
      parts: { first: 3, last: 3 },
      add: true,
    })
  })

  it('shows parts marked done or skipped', () => {
    outline({
      state: {
        ...PART_ONE_MERGED,
        parts: PART_ONE_MERGED.parts.map((part) => ({ ...part, status: part.number === 2 ? 'done' : part.number === 3 ? 'skipped' : part.status })),
        next: null,
      },
    })
    const items = screen.getAllByRole('listitem')
    expect(items[1]).toHaveTextContent('Done')
    expect(items[2]).toHaveTextContent('Skipped')
  })

  it('offers each part’s options only to someone who may ask for code, and none for a merged part', () => {
    outline({ canChange: true })
    expect(screen.queryByRole('button', { name: "Part 1's options" })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Part 2's options" })).toBeInTheDocument()
  })

  it('offers no options without the right to ask for code', () => {
    outline()
    expect(screen.queryByRole('button', { name: "Part 2's options" })).not.toBeInTheDocument()
  })
})
