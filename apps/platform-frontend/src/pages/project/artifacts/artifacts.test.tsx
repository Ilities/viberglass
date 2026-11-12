import { Theme } from '@radix-ui/themes'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ArtifactDetail, ArtifactOutput, ArtifactPreview, ArtifactVersionSummary, Project } from '@viberglass/types'
import { useProject } from '@/context/project-context'
import { getArtifact, getArtifactPreview } from '@/service/api/artifact-api'
import { getOutputs, getOutputsSummary } from '@/service/api/outputs-api'
import { getPins, markPinOpened } from '@/service/api/pins-api'
import { ArtifactPage } from './ArtifactPage'
import { ArtifactsPage } from './ArtifactsPage'

jest.mock('@/context/project-context', () => ({ useProject: jest.fn() }))
jest.mock('@/hooks/usePeople', () => ({ usePersonName: () => (id: string | null) => (id === 'u-1' ? 'Maria' : null) }))
jest.mock('@/service/api/outputs-api', () => ({ getOutputs: jest.fn(), getOutputsSummary: jest.fn() }))
jest.mock('@/service/api/pins-api', () => ({ getPins: jest.fn(), addPin: jest.fn(), removePin: jest.fn(), reorderPins: jest.fn(), markPinOpened: jest.fn() }))
jest.mock('@/service/api/artifact-api', () => ({
  getArtifact: jest.fn(),
  getArtifactPreview: jest.fn(),
  downloadArtifactVersion: jest.fn(async () => undefined),
}))

const SPACE: Project = {
  backingKind: 'files',
  id: 'space-1',
  name: 'Deck',
  slug: 'deck',
  ticketSystem: 'custom',
  autoFixEnabled: false,
  autoFixTags: [],
  customFieldMappings: {},
  isPrivate: false,
  keyPrefix: 'DECK',
  defaultReviewerIds: [],
  questionReminderHours: 4,
  createdAt: '',
  updatedAt: '',
}

function version(number: number, overrides: Partial<ArtifactVersionSummary> = {}): ArtifactVersionSummary {
  return {
    id: `ver-${number}`,
    artifactId: 'art-1',
    number,
    format: 'html',
    entrypoint: 'deck/index.html',
    fileCount: 4,
    totalBytes: 40_000,
    status: 'available',
    cover: null,
    producedBy: { kind: 'run', jobId: 'job', taskId: 'task-1' },
    createdAt: '2026-10-12T10:00:00.000Z',
    ...overrides,
  }
}

const DETAIL: ArtifactDetail = {
  id: 'art-1',
  spaceId: 'space-1',
  taskId: 'task-1',
  taskKey: 'DECK-1',
  title: 'Q4 roadmap deck',
  currentVersion: version(2),
  versionCount: 2,
  updatedAt: '2026-10-12T10:00:00.000Z',
  versions: [version(2), version(1, { status: 'expired' })],
}

function renderAt(path: string) {
  jest.mocked(useProject).mockReturnValue({ project: SPACE, isLoading: false, error: null })
  render(
    <Theme>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/spaces/:project/artifacts" element={<ArtifactsPage />} />
          <Route path="/spaces/:project/artifacts/:artifactId" element={<ArtifactPage />} />
        </Routes>
      </MemoryRouter>
    </Theme>
  )
}

const OUTPUT: ArtifactOutput = {
  type: 'artifact',
  id: 'artifact:ver-2',
  kind: 'deck',
  spaceId: 'space-1',
  spaceSlug: 'deck',
  spaceName: 'Deck',
  taskId: 'task-1',
  taskKey: 'DECK-1',
  createdAt: '2026-10-12T10:00:00.000Z',
  artifactId: 'art-1',
  versionId: 'ver-2',
  title: 'Q4 roadmap deck',
  number: 2,
  format: 'html',
  entrypoint: 'deck/index.html',
  cover: { kind: 'deck', slides: ['Q4 roadmap'], slideCount: 6 },
  current: true,
  expired: false,
  producedBy: { kind: 'agent' },
  imageUrl: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getPins).mockResolvedValue([])
  jest.mocked(markPinOpened).mockResolvedValue(undefined)
  jest.mocked(getOutputsSummary).mockResolvedValue({ counts: { all: 1, app: 0, deck: 1, doc: 0, data: 0, pdf: 0, image: 0 }, week: { made: 0, spaces: 0, releasesLive: 0 } })
})

describe('ArtifactsPage', () => {
  it("shows the space's artifacts as covers, each version's latest only", async () => {
    jest.mocked(getOutputs).mockResolvedValue({ items: [OUTPUT], nextCursor: null })
    renderAt('/spaces/deck/artifacts')

    const card = await screen.findByRole('article')
    expect(within(card).getByRole('heading', { name: 'Q4 roadmap deck' })).toBeInTheDocument()
    expect(within(card).getByText('New version from the agent for DECK-1')).toBeInTheDocument()
    expect(getOutputs).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 'space-1', latest: true }))
    expect(screen.queryByRole('combobox', { name: 'Space' })).not.toBeInTheDocument()
  })

  it('explains how to get an artifact when there are none', async () => {
    jest.mocked(getOutputs).mockResolvedValue({ items: [], nextCursor: null })
    renderAt('/spaces/deck/artifacts')
    expect(await screen.findByText('No artifacts yet')).toBeInTheDocument()
  })
})

describe('ArtifactPage', () => {
  it('previews a web page in a sandboxed frame that can run its scripts and go full screen', async () => {
    jest.mocked(getArtifact).mockResolvedValue(DETAIL)
    const preview: ArtifactPreview = {
      kind: 'frame',
      format: 'html',
      url: 'http://127.0.0.1:8890/v/token/deck/index.html',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    }
    jest.mocked(getArtifactPreview).mockResolvedValue(preview)
    renderAt('/spaces/deck/artifacts/art-1')

    const frame = await screen.findByTitle('Preview of Q4 roadmap deck')
    expect(frame).toHaveAttribute('src', preview.url)
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
    expect(frame).toHaveAttribute('allow', 'fullscreen')
    expect(getArtifactPreview).toHaveBeenCalledWith('space-1', 'art-1', 'ver-2')
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('renders a Markdown version in the app and says when it is cut short', async () => {
    jest.mocked(getArtifact).mockResolvedValue({ ...DETAIL, versions: [version(2, { format: 'markdown' })] })
    jest.mocked(getArtifactPreview).mockResolvedValue({ kind: 'text', format: 'markdown', content: '# The brief', truncated: true })
    renderAt('/spaces/deck/artifacts/art-1')

    expect(await screen.findByRole('heading', { name: 'The brief' })).toBeInTheDocument()
    expect(screen.getByText(/shows the start of the file/)).toBeInTheDocument()
  })

  it('lists every version beside the preview, marking the current one and those no longer kept', async () => {
    jest.mocked(getArtifact).mockResolvedValue({ ...DETAIL, versions: [version(2), version(1, { status: 'expired', producedBy: { kind: 'person', userId: 'u-1' } })] })
    jest.mocked(getArtifactPreview).mockResolvedValue({ kind: 'expired' })
    renderAt('/spaces/deck/artifacts/art-1?version=ver-1')

    const versions = await screen.findByRole('navigation', { name: 'Versions' })
    const [newest, oldest] = within(versions).getAllByRole('link')
    expect(newest).toHaveTextContent(/v2By the agentCurrent/)
    expect(newest).toHaveAttribute('href', '/spaces/deck/artifacts/art-1?version=ver-2')
    expect(oldest).toHaveTextContent(/Edited by Maria.*No longer kept/)
    expect(oldest).toHaveAttribute('aria-current', 'page')
    expect(within(versions).getByText('1 kept of 2')).toBeInTheDocument()
  })

  it('pins the artifact from its page, and clears its new-version mark on opening', async () => {
    jest.mocked(getArtifact).mockResolvedValue(DETAIL)
    jest.mocked(getArtifactPreview).mockResolvedValue({ kind: 'expired' })
    renderAt('/spaces/deck/artifacts/art-1')

    expect(await screen.findByRole('button', { name: 'Pin to Home' })).toBeInTheDocument()
    expect(markPinOpened).toHaveBeenCalledWith({ kind: 'artifact', artifactId: 'art-1' })
  })

  it('says an old version is no longer kept and links to the current one', async () => {
    jest.mocked(getArtifact).mockResolvedValue(DETAIL)
    jest.mocked(getArtifactPreview).mockResolvedValue({ kind: 'expired' })
    renderAt('/spaces/deck/artifacts/art-1?version=ver-1')

    expect(await screen.findByText(/This version is no longer kept/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See the current version' })).toHaveAttribute(
      'href',
      '/spaces/deck/artifacts/art-1?version=ver-2'
    )
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
  })

  it('offers a download for what it can’t preview', async () => {
    jest.mocked(getArtifact).mockResolvedValue({ ...DETAIL, versions: [version(2, { format: 'other' })] })
    jest.mocked(getArtifactPreview).mockResolvedValue({ kind: 'download', reason: 'Spreadsheets can’t be previewed yet.' })
    renderAt('/spaces/deck/artifacts/art-1')

    expect(await screen.findByText('Spreadsheets can’t be previewed yet.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Download' })).toHaveLength(2)
  })
})
