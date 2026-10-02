import type { HomeThread } from '@viberglass/types'
import { filterThreads, landingFor, lastMessageLine } from './home-threads'

function thread(overrides: Partial<HomeThread> = {}): HomeThread {
  return {
    task: { id: 't-1', key: 'WEB-1', title: 'Gift notes', spaceSlug: 'web', spaceName: 'Web shop' },
    situation: { state: 'artifact_ready', label: 'Plan v2 ready', waitingOn: { kind: 'nobody' }, since: '2026-10-01T10:00:00Z', yourMove: false },
    roles: ['watcher'],
    unread: 0,
    mentionsYou: false,
    lastMessage: null,
    latestActivityAt: '2026-10-01T10:00:00Z',
    ...overrides,
  }
}

describe('Home threads', () => {
  const read = thread({ task: { ...thread().task, id: 'read' } })
  const unread = thread({ task: { ...thread().task, id: 'unread' }, unread: 3 })
  const owned = thread({ task: { ...thread().task, id: 'owned' }, roles: ['requester', 'owner'] })

  it('shows every thread, the unread ones, or the ones you own', () => {
    expect(filterThreads([read, unread, owned], 'all').map((t) => t.task.id)).toEqual(['read', 'unread', 'owned'])
    expect(filterThreads([read, unread, owned], 'unread').map((t) => t.task.id)).toEqual(['unread'])
    expect(filterThreads([read, unread, owned], 'mine').map((t) => t.task.id)).toEqual(['owned'])
  })

  it('reads the last message with who said it', () => {
    expect(lastMessageLine({ author: { id: 'u', name: 'Tomi' }, text: 'Does it fit?', at: 't' })).toBe('Tomi: Does it fit?')
    expect(lastMessageLine({ author: null, text: 'Hello', at: 't' })).toBe('Hello')
    expect(lastMessageLine(null)).toBeNull()
  })

  it('lands viewers on Overview and everyone else on Home', () => {
    expect(landingFor('viewer')).toBe('/overview')
    for (const role of ['admin', 'member', 'guest', undefined]) expect(landingFor(role)).toBe('/')
  })
})
