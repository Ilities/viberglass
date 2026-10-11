import { codeProgress, decideTaskNextMove, describeStep, type TaskNextMoveInput } from './task-next-move'
import type { TaskPlanPartStatus } from '@viberglass/types'

type Run = TaskNextMoveInput['runs'][number]
const run = (jobKind: Run['jobKind'], status: Run['status'], jobId = `${jobKind}-${status}`): Run => ({ jobId, jobKind, status, failure: null })
const doc = (content: string) => ({ content })

function input(overrides: Partial<TaskNextMoveInput> = {}): TaskNextMoveInput {
  return {
    ticket: { workflowPhase: 'planning', status: 'open', pullRequestUrl: undefined },
    runs: [],
    plan: doc(''),
    workingSession: undefined,
    ...overrides,
  }
}

describe('decideTaskNextMove', () => {
  it('asks to start a step nothing has happened in yet', () => {
    expect(decideTaskNextMove(input())).toEqual({ kind: 'start', step: 'planning' })
  })

  it('leaves the move with the agent while a run or a session turn is working', () => {
    expect(decideTaskNextMove(input({ runs: [run('planning', 'active', 'job-1')] }))).toEqual({
      kind: 'working', step: 'planning', runId: 'job-1', sessionId: null,
    })
    expect(decideTaskNextMove(input({ workingSession: { id: 'sess-1' } }))).toEqual({
      kind: 'working', step: 'planning', runId: null, sessionId: 'sess-1',
    })
  })

  it("counts any running turn as the agent's move: a build asked for early, or a reply", () => {
    expect(decideTaskNextMove(input({ runs: [run('execution', 'queued', 'job-b')] }))).toEqual({
      kind: 'working', step: 'execution', runId: 'job-b', sessionId: null,
    })
    expect(decideTaskNextMove(input({ runs: [run('reply', 'active', 'job-r')] }))).toEqual({
      kind: 'working', step: 'planning', runId: 'job-r', sessionId: null,
    })
  })

  it('says a written plan is ready for people, whether an agent or a person wrote it', () => {
    const plan = input({ ticket: { workflowPhase: 'planning', status: 'in_review', pullRequestUrl: undefined }, plan: doc('# Plan') })
    expect(decideTaskNextMove(plan)).toEqual({ kind: 'ready', step: 'planning' })
  })

  it('reports a failed run first, even with an older document in place', () => {
    const failed = input({ runs: [run('planning', 'failed', 'job-2'), run('planning', 'completed')], plan: doc('# Old') })
    expect(decideTaskNextMove(failed)).toEqual({ kind: 'failed', step: 'planning', runId: 'job-2', failure: null })
  })

  it('offers to start again after a cancelled run that left nothing', () => {
    expect(decideTaskNextMove(input({ runs: [run('planning', 'cancelled', 'job-3')] }))).toEqual({
      kind: 'cancelled', step: 'planning', runId: 'job-3',
    })
  })

  it('only looks at runs of the current step', () => {
    const building = input({ ticket: { workflowPhase: 'execution', status: 'open', pullRequestUrl: undefined }, runs: [run('planning', 'failed')] })
    expect(decideTaskNextMove(building)).toEqual({ kind: 'start', step: 'execution' })
  })

  it('points at the pull request a build opened, and knows when the task is done', () => {
    const build = { workflowPhase: 'execution' as const, status: 'in_review' as const, pullRequestUrl: 'https://github.com/acme/web/pull/7' }
    expect(decideTaskNextMove(input({ ticket: build }))).toEqual({ kind: 'pull_request', url: build.pullRequestUrl })
    expect(decideTaskNextMove(input({ ticket: { ...build, status: 'resolved' } }))).toEqual({ kind: 'done' })
  })

  it('says a build finished without a pull request', () => {
    const build = input({ ticket: { workflowPhase: 'execution', status: 'open', pullRequestUrl: undefined }, runs: [run('execution', 'completed', 'job-4')] })
    expect(decideTaskNextMove(build)).toEqual({ kind: 'build_finished', runId: 'job-4' })
  })
})

describe('describeStep', () => {
  const working = { kind: 'working', step: 'execution', runId: null, sessionId: null } as const

  it('describes the shown step by the next move, and others by whether they exist', () => {
    expect(describeStep('planning', 'execution', working, true)).toEqual({ position: 'done', label: 'Written' })
    expect(describeStep('planning', 'planning', { kind: 'ready', step: 'planning' }, true)).toEqual({ position: 'current', label: 'Ready' })
    expect(describeStep('execution', 'planning', { kind: 'ready', step: 'planning' }, false)).toEqual({ position: 'upcoming', label: 'None yet' })
  })

  it("doesn't call the plan written when the task went straight to code", () => {
    expect(describeStep('planning', 'execution', working, false)).toEqual({ position: 'upcoming', label: 'None yet' })
  })

  it('marks the build done once the task is', () => {
    expect(describeStep('execution', 'execution', { kind: 'done' }, true)).toEqual({ position: 'done', label: 'Done' })
  })
})

describe('codeProgress', () => {
  const part = (number: number, status: TaskPlanPartStatus) => ({ number, title: null, status, pullRequestUrl: null })

  it("says how far a plan in parts has got, and nothing for a plan in one part", () => {
    expect(codeProgress({ parts: [part(1, 'merged'), part(2, 'not_built'), part(3, 'not_built')], open: null, addable: null, next: 2 })).toBe('1 of 3 parts merged')
    expect(codeProgress({ parts: [part(1, 'merged'), part(2, 'open')], open: { first: 2, last: 2 }, addable: null, next: null })).toBe('PR open for part 2')
    expect(codeProgress({ parts: [part(1, 'open')], open: { first: 1, last: null }, addable: null, next: null })).toBeNull()
    expect(codeProgress({ parts: [part(1, 'merged'), part(2, 'skipped'), part(3, 'not_built')], open: null, addable: null, next: 3 })).toBe('2 of 3 parts done')
    expect(codeProgress(null)).toBeNull()
  })

  it('shows on the Code tab in place of "Pull request open"', () => {
    expect(describeStep('execution', 'execution', { kind: 'pull_request', url: 'u' }, true, '1 of 3 parts merged').label).toBe('1 of 3 parts merged')
    expect(describeStep('execution', 'execution', { kind: 'working', step: 'execution', runId: null, sessionId: null }, true, '1 of 3 parts merged').label).toBe('Agent working')
  })
})
