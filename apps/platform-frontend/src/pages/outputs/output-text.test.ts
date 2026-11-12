import type { ArtifactOutput, PreviewOutput, ReleaseOutput } from '@viberglass/types'
import { groupByDate, outputHref, outputLabel, outputReason, weekLine } from './output-text'

const base = { spaceId: 'space-1', spaceSlug: 'board', spaceName: 'Board reporting', taskId: 'task-1', taskKey: 'BRD-4', createdAt: '2026-11-12T09:00:00.000Z' }

function artifact(overrides: Partial<ArtifactOutput> = {}): ArtifactOutput {
  return {
    ...base,
    type: 'artifact',
    id: 'artifact:ver-7',
    kind: 'deck',
    artifactId: 'art-1',
    versionId: 'ver-7',
    title: 'Q4 board deck',
    number: 7,
    format: 'html',
    entrypoint: 'deck/index.html',
    cover: null,
    current: true,
    expired: false,
    producedBy: { kind: 'agent' },
    imageUrl: null,
    ...overrides,
  }
}

const release: ReleaseOutput = { ...base, type: 'release', kind: 'app', id: 'release:r-1', releaseId: 'r-1', commitSha: 'a3f9c21deadbeef', status: 'live', appUrl: 'https://board.apps.test' }
const preview: PreviewOutput = { ...base, type: 'preview', kind: 'app', id: 'preview:p-1', previewId: 'p-1', taskTitle: 'CSV export', state: 'running' }

describe('output text', () => {
  it('links each kind to where it lives', () => {
    expect(outputHref(artifact())).toBe('/spaces/board/artifacts/art-1?version=ver-7')
    expect(outputHref(release)).toBe('/spaces/board/app')
    expect(outputHref(preview)).toBe('/spaces/board/tasks/BRD-4')
  })

  it('labels versions, releases and changes', () => {
    expect([outputLabel(artifact()), outputLabel(release), outputLabel(preview)]).toEqual(['v7', 'a3f9c21', 'BRD-4'])
  })

  it('says why each is here', () => {
    expect(outputReason(artifact())).toBe('New version from the agent for BRD-4')
    expect(outputReason(artifact({ number: 1, taskKey: null }))).toBe('Made by the agent')
    expect(outputReason(artifact({ producedBy: { kind: 'person', name: 'Maria' } }))).toBe('Edited by Maria')
    expect(outputReason(artifact({ expired: true }))).toBe('No longer kept')
    expect(outputReason(release)).toBe('Live now for BRD-4')
    expect(outputReason({ ...release, status: 'ready', taskKey: null })).toBe("Didn't go live")
    expect(outputReason(preview)).toBe('Ready to try in a preview')
  })

  it('groups newest-first items under their day', () => {
    const now = new Date(2026, 10, 12, 15)
    const at = (day: number) => new Date(2026, 10, day, 9).toISOString()
    const items = [artifact({ id: 'a', createdAt: at(12) }), artifact({ id: 'b', createdAt: at(11) }), artifact({ id: 'c', createdAt: at(8) }), artifact({ id: 'd', createdAt: at(1) })]

    expect(groupByDate(items, now).map(({ group, items: grouped }) => [group, grouped.map((item) => item.id)])).toEqual([
      ['Today', ['a']],
      ['Yesterday', ['b']],
      ['This week', ['c']],
      ['Earlier', ['d']],
    ])
  })

  it('sums up the week in plain words', () => {
    expect(weekLine({ made: 0, spaces: 0, releasesLive: 0 })).toBe('Nothing new this week.')
    expect(weekLine({ made: 1, spaces: 1, releasesLive: 0 })).toBe('1 thing made this week across 1 space')
    expect(weekLine({ made: 14, spaces: 4, releasesLive: 2 })).toBe('14 things made this week across 4 spaces · 2 releases went live')
  })
})
