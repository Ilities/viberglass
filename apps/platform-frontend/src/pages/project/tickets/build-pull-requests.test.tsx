import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TaskPullRequest } from '@/service/api/build-api'
import { BuildPullRequests, partsLabel } from './build-pull-requests'

const mockList = jest.fn()
const mockMakeLive = jest.fn()
jest.mock('@/service/api/build-api', () => ({
  getBuildPullRequests: (...args: unknown[]) => mockList(...args),
  makeChangeLive: (...args: unknown[]) => mockMakeLive(...args),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const HEAD = 'a'.repeat(40)

function openChange(overrides: { isDraft?: boolean } = {}): TaskPullRequest {
  return {
    ...pullRequest(3, 1, null),
    details: {
      title: 'Add laptops',
      state: 'open',
      isDraft: overrides.isDraft ?? false,
      headBranch: 'viberglass/lap-1',
      headSha: HEAD,
      baseBranch: 'main',
      additions: 10,
      deletions: 2,
      changedFiles: 1,
      commitCount: 1,
      previewUrl: null,
    },
  }
}

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

describe('BuildPullRequests in an App space', () => {
  it('shows the pull request as a change, and makes the commit that was read live', async () => {
    mockList.mockResolvedValue([openChange()])
    mockMakeLive.mockResolvedValue(undefined)
    const onMadeLive = jest.fn()
    render(
      <BuildPullRequests ticketId="t-1" latestUrl="https://github.com/acme/app/pull/3" runs={[]} change={{ ticketId: 't-1', canMakeLive: true, onMadeLive }} />
    )

    expect(await screen.findByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Change')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Make it live' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Make it live' }))

    expect(mockMakeLive).toHaveBeenCalledWith('t-1', { pullRequestUrl: 'https://github.com/acme/app/pull/3', headSha: HEAD })
    expect(onMadeLive).toHaveBeenCalled()
  })

  it("doesn't offer it to someone who can't make it live, or for a draft", async () => {
    mockList.mockResolvedValue([openChange()])
    const { unmount } = render(
      <BuildPullRequests ticketId="t-1" latestUrl="https://github.com/acme/app/pull/3" runs={[]} change={{ ticketId: 't-1', canMakeLive: false, onMadeLive: jest.fn() }} />
    )
    expect(await screen.findByText('Ready')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make it live' })).not.toBeInTheDocument()
    unmount()

    mockList.mockResolvedValue([openChange({ isDraft: true })])
    render(
      <BuildPullRequests ticketId="t-1" latestUrl="https://github.com/acme/app/pull/3" runs={[]} change={{ ticketId: 't-1', canMakeLive: true, onMadeLive: jest.fn() }} />
    )
    expect(await screen.findByText('Draft')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make it live' })).not.toBeInTheDocument()
  })
})
