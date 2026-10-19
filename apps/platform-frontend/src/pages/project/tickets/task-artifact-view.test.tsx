import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ArtifactSummary, ArtifactVersionSummary } from '@viberglass/types'
import { getArtifactPreview } from '@/service/api/artifact-api'
import { artifactTabLabel, TaskArtifactView } from './task-artifact-view'

jest.mock('@/service/api/artifact-api', () => ({
  getArtifacts: jest.fn(),
  getArtifactPreview: jest.fn(),
  downloadArtifactVersion: jest.fn(async () => undefined),
}))

const SPACE = { id: 'space-1', slug: 'deck' }

function version(number: number): ArtifactVersionSummary {
  return {
    id: `ver-${number}`,
    artifactId: 'art-1',
    number,
    format: 'html',
    entrypoint: 'pgs10/index.html',
    fileCount: 3,
    totalBytes: 20_000,
    status: 'available',
    producedBy: { kind: 'run', jobId: 'job', taskId: 'task-1' },
    createdAt: '2026-10-19T11:40:00.000Z',
  }
}

const ARTIFACT: ArtifactSummary = {
  id: 'art-1',
  spaceId: 'space-1',
  taskId: 'task-1',
  taskKey: 'DECK-1',
  title: 'PGS10 results',
  currentVersion: version(2),
  versionCount: 2,
  updatedAt: '2026-10-19T11:40:00.000Z',
}

function renderView(artifacts: ArtifactSummary[] | null) {
  return render(
    <Theme>
      <MemoryRouter>
        <TaskArtifactView space={SPACE} artifacts={artifacts} />
      </MemoryRouter>
    </Theme>
  )
}

describe('TaskArtifactView', () => {
  it("previews the task's artifact with a way to open and download it", async () => {
    jest.mocked(getArtifactPreview).mockResolvedValue({ kind: 'frame', format: 'html', url: 'https://preview.example/x', expiresAt: '' })

    renderView([ARTIFACT])

    expect(screen.getByRole('heading', { name: 'PGS10 results' })).toBeInTheDocument()
    expect(screen.getByText(/Version 2 of 2 · /)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/spaces/deck/artifacts/art-1')
    expect(await screen.findByTitle('Preview of PGS10 results')).toBeInTheDocument()
    expect(getArtifactPreview).toHaveBeenCalledWith('space-1', 'art-1', 'ver-2')
  })

  it('says how to get an artifact when the task has none', () => {
    renderView([])
    expect(screen.getByText('No artifact yet')).toBeInTheDocument()
  })
})

describe('artifactTabLabel', () => {
  it("names the latest version, and how many artifacts there are when there's more than one", () => {
    expect(artifactTabLabel(null)).toBe('Loading…')
    expect(artifactTabLabel([])).toBe('None yet')
    expect(artifactTabLabel([ARTIFACT])).toMatch(/^Version 2 · /)
    expect(artifactTabLabel([ARTIFACT, { ...ARTIFACT, id: 'art-2' }])).toMatch(/· 2 artifacts$/)
  })
})
