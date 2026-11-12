import { Theme } from '@radix-ui/themes'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { ArtifactOutput, OutputsSummary, ReleaseOutput } from '@viberglass/types'
import { getProjectsList } from '@/data'
import { getOutputs, getOutputsSummary } from '@/service/api/outputs-api'
import { addPin, getPins } from '@/service/api/pins-api'
import { OutputsPage } from './OutputsPage'

jest.mock('@/data', () => ({ getProjectsList: jest.fn() }))
jest.mock('@/service/api/outputs-api', () => ({ getOutputs: jest.fn(), getOutputsSummary: jest.fn() }))
jest.mock('@/service/api/pins-api', () => ({ getPins: jest.fn(), addPin: jest.fn(), removePin: jest.fn(), reorderPins: jest.fn() }))
jest.mock('@/pages/project/artifacts/artifact-preview', () => ({ ArtifactPreviewView: ({ title }: { title: string }) => <p>Preview of {title}</p> }))

const NOW = new Date().toISOString()

const deck: ArtifactOutput = {
  type: 'artifact',
  id: 'artifact:ver-7',
  kind: 'deck',
  spaceId: 'space-1',
  spaceSlug: 'board',
  spaceName: 'Board reporting',
  taskId: 'task-1',
  taskKey: 'BRD-4',
  createdAt: NOW,
  artifactId: 'art-1',
  versionId: 'ver-7',
  title: 'Q4 board deck',
  number: 7,
  format: 'html',
  entrypoint: 'deck/index.html',
  cover: { kind: 'deck', slides: ['Q4 board update', 'Revenue'], slideCount: 12 },
  current: true,
  expired: false,
  producedBy: { kind: 'agent' },
  imageUrl: null,
}

const app: ReleaseOutput = {
  type: 'release',
  kind: 'app',
  id: 'release:r-1',
  spaceId: 'space-2',
  spaceSlug: 'expenses',
  spaceName: 'Expense tracker',
  taskId: null,
  taskKey: null,
  createdAt: NOW,
  releaseId: 'r-1',
  commitSha: 'a3f9c21deadbeef',
  status: 'live',
  appUrl: 'https://expenses.apps.test',
}

const SUMMARY: OutputsSummary = { counts: { all: 2, app: 1, deck: 1, doc: 0, data: 0, pdf: 0, image: 0 }, week: { made: 2, spaces: 2, releasesLive: 1 } }

function Location() {
  const location = useLocation()
  return <output data-testid="location">{location.search}</output>
}

function renderAt(path: string) {
  render(
    <Theme>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/outputs" element={<><OutputsPage /><Location /></>} />
        </Routes>
      </MemoryRouter>
    </Theme>
  )
}

beforeEach(() => {
  localStorage.clear()
  jest.mocked(getProjectsList).mockResolvedValue([])
  jest.mocked(getOutputs).mockResolvedValue({ items: [deck, app], nextCursor: null })
  jest.mocked(getOutputsSummary).mockResolvedValue(SUMMARY)
  jest.mocked(getPins).mockResolvedValue([])
})

describe('OutputsPage', () => {
  it('shows what was made as covers under their day, with the week summed up', async () => {
    renderAt('/outputs')

    const today = await screen.findByRole('region', { name: 'Today' })
    expect(within(today).getByRole('heading', { name: 'Q4 board deck' })).toBeInTheDocument()
    expect(within(today).getByText('Q4 board update')).toBeInTheDocument()
    expect(within(today).getByText('Live')).toBeInTheDocument()
    expect(screen.getByText('2 things made this week across 2 spaces · 1 release went live')).toBeInTheDocument()
    expect(getOutputs).toHaveBeenCalledWith({ kind: undefined, spaceId: undefined, producer: undefined, q: undefined, latest: true })
  })

  it('filters by kind through the address, leaving out kinds with nothing in them', async () => {
    renderAt('/outputs')

    await screen.findByRole('heading', { name: 'Q4 board deck' })
    expect(screen.queryByRole('button', { name: /^Docs/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Decks/ }))

    await waitFor(() => expect(getOutputs).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'deck' })))
    expect(screen.getByTestId('location')).toHaveTextContent('?kind=deck')
  })

  it('shows every version when asked, and pages with Show more', async () => {
    jest.mocked(getOutputs).mockResolvedValueOnce({ items: [deck], nextCursor: 'next' }).mockResolvedValueOnce({ items: [app], nextCursor: null })
    renderAt('/outputs?versions=all')

    await userEvent.click(await screen.findByRole('button', { name: 'Show more' }))

    expect(await screen.findByRole('heading', { name: 'Expense tracker' })).toBeInTheDocument()
    expect(getOutputs).toHaveBeenLastCalledWith(expect.objectContaining({ latest: false, cursor: 'next' }))
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('opens quick look on a click and moves to the next output', async () => {
    renderAt('/outputs')

    await userEvent.click(await screen.findByRole('heading', { name: 'Q4 board deck' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Preview of Q4 board deck')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }))
    expect(within(dialog).getByRole('link', { name: 'Open app' })).toHaveAttribute('href', 'https://expenses.apps.test')
  })

  it('pins an artifact, so its card shows it, and offers no pin for a change in preview', async () => {
    jest.mocked(getOutputs).mockResolvedValue({
      items: [deck, { type: 'preview', kind: 'app', id: 'preview:p-1', spaceId: 'space-2', spaceSlug: 'expenses', spaceName: 'Expense tracker', taskId: 't-2', taskKey: 'EXP-15', createdAt: NOW, previewId: 'p-1', taskTitle: 'CSV export', state: 'running' }],
      nextCursor: null,
    })
    jest.mocked(addPin).mockResolvedValue([
      { id: 'pin-1', target: { kind: 'artifact', artifactId: 'art-1' }, title: 'Q4 board deck', kind: 'artifact', available: true, spaceId: 'space-1', spaceSlug: 'board', spaceName: 'Board reporting', current: null, imageUrl: null, hasNewVersion: false },
    ])
    renderAt('/outputs')

    await userEvent.click(await screen.findByRole('button', { name: 'Pin Q4 board deck to Home' }))

    expect(addPin).toHaveBeenCalledWith({ kind: 'artifact', artifactId: 'art-1' })
    expect(await screen.findByRole('button', { name: 'Unpin Q4 board deck from Home' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /Pin CSV export/ })).not.toBeInTheDocument()
  })

  it('offers to clear filters that match nothing', async () => {
    jest.mocked(getOutputs).mockResolvedValue({ items: [], nextCursor: null })
    renderAt('/outputs?kind=pdf')

    await userEvent.click(await screen.findByRole('button', { name: 'Clear filters' }))

    expect(screen.getByTestId('location')).toBeEmptyDOMElement()
  })
})
