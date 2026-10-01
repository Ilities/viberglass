import { decideTaskNextMove, describeStep, type TaskNextMoveInput } from './task-next-move'

type Run = TaskNextMoveInput['runs'][number]
const run = (jobKind: Run['jobKind'], status: Run['status'], jobId = `${jobKind}-${status}`): Run => ({ jobId, jobKind, status, failure: null })
const doc = (content: string, approvalState: 'draft' | 'approved' = 'draft') => ({ content, approvalState })

function input(overrides: Partial<TaskNextMoveInput> = {}): TaskNextMoveInput {
  return {
    ticket: { workflowPhase: 'research', status: 'open', pullRequestUrl: undefined },
    runs: [],
    documents: {},
    workingSession: undefined,
    ...overrides,
  }
}

describe('decideTaskNextMove', () => {
  it('asks to start a step nothing has happened in yet', () => {
    expect(decideTaskNextMove(input())).toEqual({ kind: 'start', step: 'research' })
  })

  it('leaves the move with the agent while a run or a session turn is working', () => {
    expect(decideTaskNextMove(input({ runs: [run('research', 'active', 'job-1')] }))).toEqual({
      kind: 'working', step: 'research', runId: 'job-1', sessionId: null,
    })
    expect(decideTaskNextMove(input({ workingSession: { id: 'sess-1' } }))).toEqual({
      kind: 'working', step: 'research', runId: null, sessionId: 'sess-1',
    })
  })

  it("counts any running turn as the agent's move: a plan written early, or a reply", () => {
    expect(decideTaskNextMove(input({ runs: [run('planning', 'queued', 'job-p')] }))).toEqual({
      kind: 'working', step: 'planning', runId: 'job-p', sessionId: null,
    })
    expect(decideTaskNextMove(input({ runs: [run('reply', 'active', 'job-r')] }))).toEqual({
      kind: 'working', step: 'research', runId: 'job-r', sessionId: null,
    })
  })

  it('asks for a review of a document, whether an agent or a person wrote it', () => {
    expect(decideTaskNextMove(input({ documents: { research: doc('# Findings') } }))).toEqual({ kind: 'review', step: 'research' })
    const plan = input({ ticket: { workflowPhase: 'planning', status: 'in_review', pullRequestUrl: undefined }, documents: { planning: doc('# Plan') } })
    expect(decideTaskNextMove(plan)).toEqual({ kind: 'review', step: 'planning' })
  })

  it('reports a failed run first, even with an older document in place', () => {
    const failed = input({ runs: [run('research', 'failed', 'job-2'), run('research', 'completed')], documents: { research: doc('# Old') } })
    expect(decideTaskNextMove(failed)).toEqual({ kind: 'failed', step: 'research', runId: 'job-2', failure: null })
  })

  it('offers to start again after a cancelled run that left nothing', () => {
    expect(decideTaskNextMove(input({ runs: [run('research', 'cancelled', 'job-3')] }))).toEqual({
      kind: 'cancelled', step: 'research', runId: 'job-3',
    })
  })

  it('only looks at runs of the current step', () => {
    const planning = input({ ticket: { workflowPhase: 'planning', status: 'open', pullRequestUrl: undefined }, runs: [run('research', 'failed')] })
    expect(decideTaskNextMove(planning)).toEqual({ kind: 'start', step: 'planning' })
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
  const move = { kind: 'review', step: 'planning' } as const

  it('marks earlier steps approved, later ones not yet, and the current one by the next move', () => {
    expect(describeStep('research', 'planning', move)).toEqual({ position: 'done', label: 'Approved' })
    expect(describeStep('planning', 'planning', move)).toEqual({ position: 'current', label: 'Awaiting review' })
    expect(describeStep('execution', 'planning', move)).toEqual({ position: 'upcoming', label: 'Not yet' })
  })

  it('marks the build done once the task is', () => {
    expect(describeStep('execution', 'execution', { kind: 'done' })).toEqual({ position: 'done', label: 'Done' })
  })
})
