import { Theme } from '@radix-ui/themes'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { AppDataBackup, AppReleaseView } from '@viberglass/types'
import { getAppBackups, getReleaseBuildLog } from '@/service/api/app-api'
import { AppBackups } from './app-backups'
import { ChangesInPreview } from './changes-in-preview'
import { ReleasesTable } from './releases-table'

jest.mock('@/service/api/app-api', () => ({ getReleaseBuildLog: jest.fn(), getAppBackups: jest.fn() }))

function release(id: string, overrides: Partial<AppReleaseView> = {}): AppReleaseView {
  return {
    id,
    projectId: 'space-1',
    commitSha: `${id}aaaaaaaaaaa`,
    status: 'ready',
    jobId: null,
    bundleSha256: null,
    bundleBytes: 4_700_000,
    nodeVersion: null,
    failureReason: null,
    wentLiveAt: null,
    liveFailure: null,
    ticketId: null,
    rolledBackAt: null,
    bundleRemoved: false,
    createdAt: '2026-11-04T10:00:00.000Z',
    finishedAt: null,
    ...overrides,
  }
}

const inRouter = (node: React.ReactNode) =>
  render(
    <Theme>
      <MemoryRouter>{node}</MemoryRouter>
    </Theme>
  )

describe('ReleasesTable', () => {
  it("links each release to its task, shows its size, and opens its build log when asked", async () => {
    jest.mocked(getReleaseBuildLog).mockResolvedValue('added 104 packages\n')
    const live = release('live111', { ticketId: 't-3', wentLiveAt: '2026-11-04T10:05:00.000Z' })
    inRouter(<ReleasesTable projectId="space-1" spaceSlug="laptops" releases={[live]} current={live} tasks={{ 't-3': { key: 'LT-3', title: 'Show warranties' } }} />)

    expect(screen.getByRole('link', { name: 'LT-3' })).toHaveAttribute('href', '/spaces/laptops/tasks/LT-3')
    expect(screen.getByText('4.5 MB')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Build log for live111' }))
    expect(await screen.findByText(/added 104 packages/)).toBeInTheDocument()
    expect(getReleaseBuildLog).toHaveBeenCalledWith('space-1', 'live111')
    expect(screen.getByRole('button', { name: 'Hide the build log for live111' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('offers no build log while a release is building', () => {
    inRouter(<ReleasesTable projectId="space-1" spaceSlug="laptops" releases={[release('build11', { status: 'building' })]} current={null} tasks={{}} />)

    expect(screen.queryByRole('button', { name: /Build log/ })).not.toBeInTheDocument()
  })
})

describe('ChangesInPreview', () => {
  it('lists changes in a preview, each linked to its task', () => {
    inRouter(
      <ChangesInPreview
        spaceSlug="laptops"
        previews={[{ id: 'p-1', taskId: 't-5', state: 'failed', statusMessage: 'exit code 1' }]}
        tasks={{ 't-5': { key: 'LT-5', title: 'CSV export' } }}
      />
    )

    const list = screen.getByRole('list', { name: 'Changes in preview' })
    expect(within(list).getByRole('link', { name: 'CSV export' })).toHaveAttribute('href', '/spaces/laptops/tasks/LT-5')
    expect(within(list).getByText(/Couldn't start/)).toBeInTheDocument()
    expect(within(list).getByText(/exit code 1/)).toBeInTheDocument()
  })

  it('shows nothing when no change is in a preview', () => {
    inRouter(<ChangesInPreview spaceSlug="laptops" previews={[]} tasks={{}} />)

    expect(screen.queryByRole('heading', { name: 'Changes in preview' })).not.toBeInTheDocument()
  })
})

describe('AppBackups', () => {
  it('lists the newest five backups with why they were taken, and all of them when asked', async () => {
    const backups: AppDataBackup[] = Array.from({ length: 7 }, (_, index) => ({
      id: `b-${index}`,
      reason: index === 0 ? 'manual' : 'release',
      takenAt: '2026-11-04T10:00:00.000Z',
      fromRelease: index === 0 ? { id: 'r', commitSha: '9676d30aaaa' } : null,
      bytes: 12_288,
    }))
    jest.mocked(getAppBackups).mockResolvedValue(backups)
    inRouter(<AppBackups projectId="space-1" refreshKey={false} />)

    expect(await screen.findByText('backed up by hand')).toBeInTheDocument()
    expect(screen.getByText('9676d30')).toBeInTheDocument()
    expect(screen.getAllByText('12 KB')).toHaveLength(5)

    await userEvent.click(screen.getByRole('button', { name: 'Show all 7 backups' }))
    expect(screen.getAllByText('12 KB')).toHaveLength(7)
  })
})
