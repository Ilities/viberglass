import type { TaskTimelineEntry } from '@viberglass/types'
import { attemptsLabel, foldAttempts } from './thread-folds'

const turn = (id: string, status: 'failed' | 'cancelled' | 'completed'): TaskTimelineEntry => ({
  kind: 'agent_turn', id, at: '2026-10-01T10:00:00Z', agent: { id: 'a', name: 'Qwen' }, action: 'plan', status, outcome: null, sessionId: 's', jobId: null,
})
const message = (id: string, body: string): TaskTimelineEntry => ({
  kind: 'message', id, at: '2026-10-01T10:00:00Z', author: null, body, channel: 'thread', sessionId: null,
})
const cancelled = (id: string): TaskTimelineEntry => ({
  kind: 'event', id, at: '2026-10-01T10:00:00Z',
  activity: { id, ticketId: 't', actorType: 'human', actor: null, kind: 'run_cancelled', payload: {}, createdAt: '2026-10-01T10:00:00Z' },
})

const shape = (entries: TaskTimelineEntry[], keepId: string | null = null) =>
  foldAttempts(entries, keepId).map((row) => (row.kind === 'entry' ? row.entry.id : row.entries.map((entry) => entry.id)))

describe('foldAttempts', () => {
  it('folds unfinished turns in a row with the retries and run-ended lines between and after them', () => {
    const entries = [turn('a', 'failed'), message('r1', 'Try again with Qwen'), turn('b', 'cancelled'), cancelled('e1'), message('r2', 'Try again'), turn('c', 'completed')]
    expect(shape(entries)).toEqual([['a', 'r1', 'b', 'e1'], 'r2', 'c'])
  })

  it("never folds a person's own message, nor a single failed turn", () => {
    const entries = [turn('a', 'failed'), message('m', 'do this now'), turn('b', 'failed'), message('r', 'Try again')]
    expect(shape(entries)).toEqual(['a', 'm', 'b', 'r'])
  })

  it('keeps the turn asked to stay out of the fold', () => {
    const entries = [turn('a', 'failed'), message('r1', 'Try again'), turn('b', 'failed'), message('r2', 'Try again'), turn('c', 'failed')]
    expect(shape(entries, 'c')).toEqual([['a', 'r1', 'b'], 'r2', 'c'])
  })
})

describe('attemptsLabel', () => {
  it('says how the attempts ended', () => {
    const failed = turn('a', 'failed')
    const stopped = turn('b', 'cancelled')
    if (failed.kind !== 'agent_turn' || stopped.kind !== 'agent_turn') throw new Error('expected turns')
    expect(attemptsLabel([failed, failed])).toBe('2 failed attempts')
    expect(attemptsLabel([stopped, stopped])).toBe('2 stopped attempts')
    expect(attemptsLabel([failed, stopped])).toBe('2 failed or stopped attempts')
  })
})
