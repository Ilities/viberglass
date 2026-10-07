import { render, screen } from '@testing-library/react'
import type { TaskPullRequest } from '@/service/api/build-api'
import { BuildPullRequests, partsLabel } from './build-pull-requests'

const mockList = jest.fn()
jest.mock('@/service/api/build-api', () => ({
  getBuildPullRequests: (...args: unknown[]) => mockList(...args),
}))

function pullRequest(number: number, firstPart: number, lastPart: number | null): TaskPullRequest {
  return {
    pullRequestUrl: `https://github.com/acme/app/pull/${number}`,
    branch: `viberglass/t-${number}`,
    firstPart,
    lastPart,
    details: null,
    comments: [],
    unavailableReason: null,
  }
}

describe('partsLabel', () => {
  it('says which parts of the plan a pull request builds', () => {
    expect(partsLabel({ firstPart: 1, lastPart: null })).toBe('The whole plan')
    expect(partsLabel({ firstPart: 2, lastPart: 2 })).toBe('Part 2')
    expect(partsLabel({ firstPart: 2, lastPart: 3 })).toBe('Parts 2–3')
    expect(partsLabel({ firstPart: 2, lastPart: null })).toBe('Parts 2 to the end')
  })
})

describe('BuildPullRequests', () => {
  it('shows a task with one pull request as before, without a parts heading', async () => {
    mockList.mockResolvedValue([pullRequest(7, 1, null)])
    render(<BuildPullRequests ticketId="t-1" latestUrl="https://github.com/acme/app/pull/7" runs={[]} />)

    expect(await screen.findByText('acme/app/pull/7')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'The whole plan' })).not.toBeInTheDocument()
  })

  it('lists each pull request under the parts it builds, oldest first', async () => {
    mockList.mockResolvedValue([pullRequest(7, 1, 1), pullRequest(9, 2, null)])
    render(<BuildPullRequests ticketId="t-1" latestUrl="https://github.com/acme/app/pull/9" runs={[]} />)

    expect(await screen.findByRole('region', { name: 'Part 1' })).toHaveTextContent('acme/app/pull/7')
    expect(screen.getByRole('region', { name: 'Parts 2 to the end' })).toHaveTextContent('acme/app/pull/9')
  })
})
