import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { AppPreview, TaskPullRequest } from '@/service/api/build-api'
import { BuildPullRequests, partsLabel } from './build-pull-requests'

const mockList = jest.fn()
const mockMakeLive = jest.fn()
const mockPreviews = jest.fn()
const mockTry = jest.fn()
jest.mock('@/service/api/build-api', () => ({
  getBuildPullRequests: (...args: unknown[]) => mockList(...args),
  makeChangeLive: (...args: unknown[]) => mockMakeLive(...args),
  getChangePreviews: (...args: unknown[]) => mockPreviews(...args),
  tryChange: (...args: unknown[]) => mockTry(...args),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const HEAD = 'a'.repeat(40)
const CHANGE_URL = 'https://github.com/acme/app/pull/3'

function preview(overrides: Partial<AppPreview> = {}): AppPreview {
  return {
    id: 'pv-1',
    pullRequestUrl: CHANGE_URL,
    commitSha: HEAD,
    power: 'on',
    state: 'running',
    statusMessage: null,
    triedCommitSha: HEAD,
    url: 'https://preview-abcd2345.apps.example.com',
    ...overrides,
  }
}

beforeEach(() => mockPreviews.mockResolvedValue([]))

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
    recorded: null,
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

    expect(await screen.findByText('acme/app#7')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'The whole plan' })).not.toBeInTheDocument()
  })

  it('lists each pull request under the parts it builds, oldest first', async () => {
    mockList.mockResolvedValue([pullRequest(7, 1, 1), pullRequest(9, 2, null)])
    render(<BuildPullRequests ticketId="t-1" latestUrl="https://github.com/acme/app/pull/9" runs={[]} />)

    expect(await screen.findByRole('region', { name: 'Part 1' })).toHaveTextContent('acme/app#7')
    expect(screen.getByRole('region', { name: 'Parts 2 to the end' })).toHaveTextContent('acme/app#9')
  })
})

describe("BuildPullRequests when GitHub can't be read", () => {
  const recorded = {
    state: 'merged' as const,
    mergedAt: '2026-09-06T10:00:00.000Z',
    closedAt: '2026-09-06T10:00:00.000Z',
    mergedBy: 'octocat',
    commentCount: 3,
    reviewCommentCount: 1,
    checkedAt: '2026-09-06T11:00:00.000Z',
  }

  it('shows what Viberglass recorded instead of unknowns', async () => {
    mockList.mockResolvedValue([{ ...pullRequest(7, 1, null), recorded }])
    render(<BuildPullRequests ticketId="t-1" latestUrl="https://github.com/acme/app/pull/7" runs={[]} />)

    expect(await screen.findByText('Merged')).toBeInTheDocument()
    expect(screen.getByText('octocat')).toBeInTheDocument()
    expect(screen.getByText('viberglass/t-7')).toBeInTheDocument()
    expect(screen.getByText('3 comments, 1 on the code')).toBeInTheDocument()
    expect(screen.getByText('Last checked')).toBeInTheDocument()
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument()
    expect(screen.queryByText('Changes')).not.toBeInTheDocument()
    expect(screen.queryByText('Commits')).not.toBeInTheDocument()
  })

  it('says it has not been checked yet when nothing was recorded, without a configuration note', async () => {
    mockList.mockResolvedValue([pullRequest(7, 1, null)])
    render(<BuildPullRequests ticketId="t-1" latestUrl="https://github.com/acme/app/pull/7" runs={[]} />)

    expect(await screen.findByText('Not checked yet')).toBeInTheDocument()
    expect(screen.getByText('Not available')).toBeInTheDocument()
    expect(screen.queryByText(/token/)).not.toBeInTheDocument()
  })

  it('shows the note on the repository connection when the server sends one', async () => {
    const reason = "Live details from the code host need a working repository connection: the space's repository connection has no token"
    mockList.mockResolvedValue([{ ...pullRequest(7, 1, null), recorded, unavailableReason: reason }])
    render(<BuildPullRequests ticketId="t-1" latestUrl="https://github.com/acme/app/pull/7" runs={[]} />)

    expect(await screen.findByText(reason)).toBeInTheDocument()
    expect(screen.getByText('Merged')).toBeInTheDocument()
  })
})

describe('BuildPullRequests in an App space', () => {
  it('shows the pull request as a change, and makes the commit that was tried live', async () => {
    mockList.mockResolvedValue([openChange()])
    mockPreviews.mockResolvedValue([preview()])
    mockMakeLive.mockResolvedValue(undefined)
    const onMadeLive = jest.fn()
    render(
      <BuildPullRequests ticketId="t-1" latestUrl={CHANGE_URL} runs={[]} change={{ ticketId: 't-1', canMakeLive: true, canTry: true, onMadeLive }} />,
      { wrapper: MemoryRouter }
    )

    expect(await screen.findByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Change')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Open preview' })).toHaveAttribute('href', 'https://preview-abcd2345.apps.example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Make it live' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Make it live' }))

    expect(mockMakeLive).toHaveBeenCalledWith('t-1', { pullRequestUrl: 'https://github.com/acme/app/pull/3', headSha: HEAD })
    expect(onMadeLive).toHaveBeenCalled()
  })

  it('asks for Try it before Make it live, and shows the preview being built', async () => {
    mockList.mockResolvedValue([openChange()])
    const building = preview({ state: 'building', triedCommitSha: 'b'.repeat(40) })
    mockPreviews.mockResolvedValueOnce([preview({ commitSha: 'b'.repeat(40), triedCommitSha: 'b'.repeat(40) })]).mockResolvedValue([building])
    mockTry.mockResolvedValue(building)
    render(
      <BuildPullRequests ticketId="t-1" latestUrl={CHANGE_URL} runs={[]} change={{ ticketId: 't-1', canMakeLive: true, canTry: true, onMadeLive: jest.fn() }} />,
      { wrapper: MemoryRouter }
    )

    expect(await screen.findByText('Running an older version')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make it live' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try the latest' }))

    expect(mockTry).toHaveBeenCalledWith('t-1', { pullRequestUrl: CHANGE_URL, headSha: HEAD })
    expect(await screen.findByRole('button', { name: 'Building the preview…' })).toBeDisabled()
  })

  it("doesn't offer it to someone who can't make it live, or for a draft", async () => {
    mockList.mockResolvedValue([openChange()])
    mockPreviews.mockResolvedValue([preview()])
    const { unmount } = render(
      <BuildPullRequests ticketId="t-1" latestUrl={CHANGE_URL} runs={[]} change={{ ticketId: 't-1', canMakeLive: false, canTry: true, onMadeLive: jest.fn() }} />,
      { wrapper: MemoryRouter }
    )
    expect(await screen.findByText('Ready')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make it live' })).not.toBeInTheDocument()
    unmount()

    mockList.mockResolvedValue([openChange({ isDraft: true })])
    render(
      <BuildPullRequests ticketId="t-1" latestUrl={CHANGE_URL} runs={[]} change={{ ticketId: 't-1', canMakeLive: true, canTry: true, onMadeLive: jest.fn() }} />,
      { wrapper: MemoryRouter }
    )
    expect(await screen.findByText('Draft')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make it live' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try it' })).not.toBeInTheDocument()
  })

  it('lets a viewer open a running preview without offering Try it', async () => {
    mockList.mockResolvedValue([openChange()])
    mockPreviews.mockResolvedValue([preview()])
    render(
      <BuildPullRequests ticketId="t-1" latestUrl={CHANGE_URL} runs={[]} change={{ ticketId: 't-1', canMakeLive: false, canTry: false, onMadeLive: jest.fn() }} />,
      { wrapper: MemoryRouter }
    )

    const link = await screen.findByRole('link', { name: 'Open preview' })
    expect(link).toHaveAttribute('href', 'https://preview-abcd2345.apps.example.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make it live' })).not.toBeInTheDocument()
  })

  it("opens a running preview when the change's latest commit can't be read", async () => {
    const reason = "Live details from the code host need a working repository connection: the space's repository connection has no token"
    mockList.mockResolvedValue([{ ...pullRequest(3, 1, null), unavailableReason: reason }])
    mockPreviews.mockResolvedValue([preview()])
    render(
      <BuildPullRequests ticketId="t-1" latestUrl={CHANGE_URL} runs={[]} change={{ ticketId: 't-1', canMakeLive: true, canTry: true, onMadeLive: jest.fn() }} />,
      { wrapper: MemoryRouter }
    )

    expect(await screen.findByRole('link', { name: 'Open preview' })).toHaveAttribute('href', 'https://preview-abcd2345.apps.example.com')
    expect(screen.queryByRole('button', { name: /Try/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make it live' })).not.toBeInTheDocument()
  })

  it("doesn't link to a preview that isn't running", async () => {
    mockList.mockResolvedValue([openChange()])
    mockPreviews.mockResolvedValue([preview({ power: 'off', state: 'off' })])
    render(
      <BuildPullRequests ticketId="t-1" latestUrl={CHANGE_URL} runs={[]} change={{ ticketId: 't-1', canMakeLive: false, canTry: false, onMadeLive: jest.fn() }} />,
      { wrapper: MemoryRouter }
    )

    expect(await screen.findByText('Off')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open preview' })).not.toBeInTheDocument()
  })

  it("doesn't show a preview for a change that was made live", async () => {
    const change = openChange()
    mockList.mockResolvedValue([{ ...change, details: change.details && { ...change.details, state: 'merged' } }])
    render(
      <BuildPullRequests ticketId="t-1" latestUrl={CHANGE_URL} runs={[]} change={{ ticketId: 't-1', canMakeLive: true, canTry: true, onMadeLive: jest.fn() }} />,
      { wrapper: MemoryRouter }
    )

    expect(await screen.findByText('Made live')).toBeInTheDocument()
    expect(screen.queryByText('Preview')).not.toBeInTheDocument()
    expect(screen.queryByText('Not tried yet')).not.toBeInTheDocument()
  })
})
