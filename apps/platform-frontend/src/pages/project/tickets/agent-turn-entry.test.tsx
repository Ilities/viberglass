import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { SpaceFilesSnapshotSummary, TaskTimelineEntry, TaskTurnOutcome } from '@viberglass/types'
import type { JobListItem } from '@/service/api/job-api'
import { AgentTurnEntry, filesLine } from './agent-turn-entry'

jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Me', role: 'member' } }) }))

const FILES: SpaceFilesSnapshotSummary = {
  id: 's2',
  parentId: 's1',
  fileCount: 14,
  totalBytes: 2048,
  partial: false,
  changes: { added: 2, changed: 1, removed: 0 },
  createdAt: '',
}

const OUTCOME: TaskTurnOutcome = { intent: null, reply: 'Done.', produced: [], codeDiscarded: false, resumed: null }

function turn(overrides: Partial<Extract<TaskTimelineEntry, { kind: 'agent_turn' }>>): Extract<TaskTimelineEntry, { kind: 'agent_turn' }> {
  return {
    kind: 'agent_turn',
    id: 't1',
    at: new Date().toISOString(),
    agent: { id: 'a1', name: 'Claude' },
    action: 'reply',
    status: 'completed',
    outcome: OUTCOME,
    sessionId: 'session',
    jobId: 'job_1',
    ...overrides,
  }
}

function renderEntry(entry: Extract<TaskTimelineEntry, { kind: 'agent_turn' }>, run?: Partial<JobListItem>, filesSpace = true) {
  render(
    <Theme>
      <MemoryRouter>
        <AgentTurnEntry
          entry={entry}
          run={run as JobListItem | undefined}
          filesSpace={filesSpace}
          space={{ id: 'space-1', slug: 'deck' }}
        />
      </MemoryRouter>
    </Theme>
  )
}

describe('filesLine', () => {
  it('counts what the turn changed and the files the space has', () => {
    expect(filesLine(FILES)).toBe('Saved files · 2 added, 1 changed · 14 files')
  })

  it('says when nothing changed', () => {
    expect(filesLine({ ...FILES, fileCount: 1, changes: { added: 0, changed: 0, removed: 0 } })).toBe('Saved files · no changes · 1 file')
  })

  it('marks files saved after a failure as partial', () => {
    expect(filesLine({ ...FILES, partial: true, changes: { added: 0, changed: 0, removed: 3 } })).toBe(
      'Saved partial files after the run failed · 3 removed · 14 files'
    )
  })
})

describe('AgentTurnEntry in a Files space', () => {
  it('shows what the turn saved', () => {
    renderEntry(turn({ outcome: { ...OUTCOME, files: FILES } }))
    expect(screen.getByText('Saved files · 2 added, 1 changed · 14 files')).toBeInTheDocument()
  })

  it('shows each artifact the turn produced, with its preview and download', () => {
    renderEntry(
      turn({
        action: 'code',
        outcome: {
          ...OUTCOME,
          files: FILES,
          artifacts: [{ artifactId: 'art-1', versionId: 'ver-2', title: 'Q4 roadmap deck', number: 2, format: 'html' }],
        },
      })
    )
    const card = screen.getByLabelText('Artifact Q4 roadmap deck')
    expect(card).toHaveTextContent('Version 2 · Web page')
    expect(screen.getByRole('link', { name: 'Preview' })).toHaveAttribute('href', '/spaces/deck/artifacts/art-1?version=ver-2')
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
    expect(screen.getByText(/asked for an artifact/)).toBeInTheDocument()
  })

  it('says a queued run is waiting for another run to save the files', () => {
    renderEntry(turn({ status: 'queued', outcome: null }), { status: 'queued' })
    expect(screen.getByText(/Waiting for another run to save this space’s files/)).toBeInTheDocument()
  })

  it('shows a started run as working', () => {
    renderEntry(turn({ status: 'running', outcome: null }), { status: 'active' })
    expect(screen.getByText(/Working on it/)).toBeInTheDocument()
  })

  it('keeps a queued run in a Git space as working', () => {
    renderEntry(turn({ status: 'queued', outcome: null }), { status: 'queued' }, false)
    expect(screen.getByText(/Working on it/)).toBeInTheDocument()
  })
})
