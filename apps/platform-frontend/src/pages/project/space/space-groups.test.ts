import { groupOf, groupTasks, matchesSituationFilters, NO_SITUATION_FILTERS, peopleIn } from './space-groups'
import { testTask } from './test-task'

const MARIA = { id: 'maria', name: 'Maria' }
const TOMI = { id: 'tomi', name: 'Tomi' }

const task = testTask

describe('space groups', () => {
  it("puts the viewer's move first, whatever the state", () => {
    expect(groupOf(task('1', { state: 'artifact_ready', yourMove: true }))).toBe('needs_you')
    expect(groupOf(task('2', { state: 'failed', yourMove: true }))).toBe('needs_you')
  })

  it('sorts the rest by what happens next, with questions, ready artifacts and discussions waiting on someone else', () => {
    expect(groupOf(task('1', { state: 'agent_working' }))).toBe('agent_working')
    expect(groupOf(task('2', { state: 'failed' }))).toBe('failed')
    expect(groupOf(task('3', { state: 'pr_open' }))).toBe('pr_open')
    expect(groupOf(task('4', { state: 'not_started' }))).toBe('not_started')
    for (const state of ['question', 'artifact_ready', 'discussing'] as const) expect(groupOf(task(state, { state }))).toBe('waiting')
    expect(groupOf(task('5', { state: 'done', yourMove: true }))).toBe('done')
  })

  it('leaves out empty groups and orders each by latest activity', () => {
    const older = task('old', { state: 'failed' }, { updatedAt: '2026-10-01T00:00:00.000Z' })
    const newer = task('new', { state: 'failed' }, { updatedAt: '2026-10-02T00:00:00.000Z' })
    const mine = task('mine', { yourMove: true })

    expect(groupTasks([older, newer, mine])).toEqual([
      { group: 'needs_you', tasks: [mine] },
      { group: 'failed', tasks: [newer, older] },
    ])
  })

  it('filters by state, owner and whose move', () => {
    const waitingOnTomi = task('1', { state: 'artifact_ready', waitingOn: { kind: 'people', people: [TOMI] } }, { owner: MARIA })
    const agent = task('2', { state: 'agent_working', waitingOn: { kind: 'agent' } })

    expect(matchesSituationFilters(waitingOnTomi, { ...NO_SITUATION_FILTERS, state: 'artifact_ready' })).toBe(true)
    expect(matchesSituationFilters(agent, { ...NO_SITUATION_FILTERS, state: 'artifact_ready' })).toBe(false)
    expect(matchesSituationFilters(waitingOnTomi, { ...NO_SITUATION_FILTERS, ownerId: 'maria' })).toBe(true)
    expect(matchesSituationFilters(agent, { ...NO_SITUATION_FILTERS, ownerId: 'maria' })).toBe(false)
    expect(matchesSituationFilters(waitingOnTomi, { ...NO_SITUATION_FILTERS, waitingOn: 'tomi' })).toBe(true)
    expect(matchesSituationFilters(agent, { ...NO_SITUATION_FILTERS, waitingOn: 'agent' })).toBe(true)
    expect(matchesSituationFilters(waitingOnTomi, { ...NO_SITUATION_FILTERS, waitingOn: 'agent' })).toBe(false)
  })

  it("lists the owners and people waited on, for the filters' choices", () => {
    const tasks = [task('1', { waitingOn: { kind: 'people', people: [TOMI] } }, { owner: MARIA }), task('2', {}, { owner: MARIA })]
    expect(peopleIn(tasks)).toEqual({ owners: [MARIA], waitedOn: [TOMI] })
  })
})
