import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { SpaceFilesSnapshotSummary, TurnArtifact } from '@viberglass/types'
import { getRunFiles } from '@/service/api/space-files-api'
import { RunFilesOutcome } from './run-files-outcome'

jest.mock('@/service/api/space-files-api', () => ({ getRunFiles: jest.fn() }))

const FILES: SpaceFilesSnapshotSummary = {
  id: 's2',
  parentId: 's1',
  fileCount: 4,
  totalBytes: 2048,
  partial: false,
  changes: { added: 1, changed: 1, removed: 0 },
  createdAt: '',
}

const ARTIFACT: TurnArtifact = { artifactId: 'a-1', versionId: 'v-1', title: 'Weekly report', number: 1, format: 'html' }

function renderOutcome(status: 'active' | 'completed' | 'cancelled') {
  render(
    <Theme>
      <MemoryRouter>
        <RunFilesOutcome job={{ jobId: 'claw_1', status }} space={{ id: 'space-1', slug: 'reports' }} />
      </MemoryRouter>
    </Theme>
  )
}

describe('RunFilesOutcome', () => {
  beforeEach(() => jest.mocked(getRunFiles).mockReset())

  it('shows the artifacts a finished scheduled run made and what it saved', async () => {
    jest.mocked(getRunFiles).mockResolvedValue({ files: FILES, artifacts: [ARTIFACT] })

    renderOutcome('completed')

    expect(await screen.findByLabelText('Artifact Weekly report')).toBeInTheDocument()
    expect(screen.getByText('Saved files · 1 added, 1 changed · 4 files')).toBeInTheDocument()
    expect(getRunFiles).toHaveBeenCalledWith('claw_1')
  })

  it("says a run that saved nothing left the space's files as they were", async () => {
    jest.mocked(getRunFiles).mockResolvedValue({ files: null, artifacts: [] })

    renderOutcome('cancelled')

    expect(await screen.findByText("This run saved nothing, so the space's files are as they were before it.")).toBeInTheDocument()
  })

  it('waits for the run to finish', () => {
    renderOutcome('active')

    expect(getRunFiles).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Files' })).not.toBeInTheDocument()
  })
})
