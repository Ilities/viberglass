import type { HomeThread } from '@viberglass/types'
import { attentionLine, filterThreads, greeting, landingFor, lastMessageLine, needsYouReason, turnLine } from './home-threads'

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

describe('Home rows', () => {
  const situation = (waitingOn: HomeThread['situation']['waitingOn'], state: HomeThread['situation']['state'] = 'artifact_ready') => ({
    state,
    label: 'Plan v2 ready',
    waitingOn,
    since: 't',
    yourMove: false,
  })

  it("says whose turn it is by first name, or that the agent's working", () => {
    expect(turnLine(situation({ kind: 'people', people: [{ id: 'q', name: 'Quinn QA' }] }))).toBe("Quinn's turn")
    expect(turnLine(situation({ kind: 'people', people: [{ id: 'q', name: 'Quinn QA' }, { id: 'd', name: 'Dev Engineer' }] }))).toBe("Quinn and Dev's turn")
    expect(turnLine(situation({ kind: 'agent' }, 'discussing'))).toBe('Agent working')
    expect(turnLine(situation({ kind: 'agent' }, 'agent_working'))).toBeNull()
    expect(turnLine(situation({ kind: 'nobody' }))).toBeNull()
  })

  it('says why a thread needs you', () => {
    expect(needsYouReason(thread({ situation: situation({ kind: 'nobody' }, 'question') }))).toBe('Agent asked you')
    expect(needsYouReason(thread({ mentionsYou: true, lastMessage: { author: { id: 'oc', name: 'OpenCode' }, text: 'Plan written', at: 't' } }))).toBe(
      'Ready for your review',
    )
    expect(
      needsYouReason(
        thread({
          situation: situation({ kind: 'nobody' }, 'discussing'),
          mentionsYou: true,
          lastMessage: { author: { id: 't', name: 'Tomi Laine' }, text: 'Look', at: 't' },
        }),
      ),
    ).toBe('Tomi mentioned you')
    expect(needsYouReason(thread())).toBe('Your move')
  })

  it('greets by the hour and counts what needs you', () => {
    expect(greeting(new Date(2026, 9, 5, 9))).toBe('Good morning')
    expect(greeting(new Date(2026, 9, 5, 14))).toBe('Good afternoon')
    expect(greeting(new Date(2026, 9, 5, 21))).toBe('Good evening')
    expect(attentionLine(0)).toBe('Your conversations and next moves, in one place.')
    expect(attentionLine(1)).toBe('One conversation needs your attention.')
    expect(attentionLine(2)).toBe('2 conversations need your attention.')
  })
})
