import { decideRunNextStep, type RunNextStepInput } from './run-next-step'

function input(overrides: Partial<RunNextStepInput['job']> = {}, rest: Partial<Omit<RunNextStepInput, 'job'>> = {}): RunNextStepInput {
  return {
    job: { status: 'completed', jobKind: 'research', agentSessionId: null, result: { success: true }, ...overrides },
    newerRunId: null,
    taskPhase: 'research',
    document: { content: '# Research\n\nFindings', approvalState: 'draft' },
    ...rest,
  }
}

describe('decideRunNextStep', () => {
  it('asks for a review of fresh research while the task is still researching', () => {
    expect(decideRunNextStep(input())).toEqual({ kind: 'review_research', preview: '# Research\n\nFindings' })
  })

  it('says the task moved on once research was approved', () => {
    expect(decideRunNextStep(input({}, { taskPhase: 'planning' }))).toEqual({ kind: 'moved_on', phase: 'research' })
  })

  it('asks for a plan review until the plan is approved', () => {
    const plan = input({ jobKind: 'planning' }, { taskPhase: 'planning' })
    expect(decideRunNextStep(plan).kind).toBe('review_plan')

    const approved = { ...plan, document: { content: '# Plan', approvalState: 'approved' as const } }
    expect(decideRunNextStep(approved)).toEqual({ kind: 'moved_on', phase: 'planning' })
  })

  it('points at the pull request a build opened', () => {
    const build = input({ jobKind: 'execution', result: { success: true, pullRequestUrl: 'https://github.com/acme/web/pull/7' } })
    expect(decideRunNextStep(build)).toEqual({ kind: 'pull_request', url: 'https://github.com/acme/web/pull/7' })
  })

  it('sends people to a newer run of the same kind instead of reviewing an old result', () => {
    expect(decideRunNextStep(input({}, { newerRunId: 'job-2' }))).toEqual({ kind: 'superseded', newerRunId: 'job-2' })
    expect(decideRunNextStep(input({ status: 'failed' }, { newerRunId: 'job-2' })).kind).toBe('superseded')
  })

  it('leaves a running or queued run alone, even if a newer one exists', () => {
    expect(decideRunNextStep(input({ status: 'active' }, { newerRunId: 'job-2' }))).toEqual({ kind: 'running' })
    expect(decideRunNextStep(input({ status: 'queued' }))).toEqual({ kind: 'queued' })
  })

  it('offers to run a cancelled phase again only while the task is in that phase', () => {
    expect(decideRunNextStep(input({ status: 'cancelled' }))).toEqual({ kind: 'cancelled', canRunAgain: true })
    expect(decideRunNextStep(input({ status: 'cancelled' }, { taskPhase: 'planning' }))).toEqual({
      kind: 'cancelled',
      canRunAgain: false,
    })
  })

  it('asks for a review when a session turn wrote the document, and sends other turns to their session', () => {
    expect(decideRunNextStep(input({ agentSessionId: 'sess-1' })).kind).toBe('review_research')

    const noDocument = input({ agentSessionId: 'sess-1' }, { document: { content: '', approvalState: 'draft' } })
    expect(decideRunNextStep(noDocument)).toEqual({ kind: 'session', sessionId: 'sess-1' })
  })

  it('reports failure before anything else about a finished run', () => {
    expect(decideRunNextStep(input({ status: 'failed' }))).toEqual({ kind: 'failed' })
  })
})
