import { decideRunNextStep, type RunNextStepInput } from './run-next-step'

function input(overrides: Partial<RunNextStepInput['job']> = {}, rest: Partial<Omit<RunNextStepInput, 'job'>> = {}): RunNextStepInput {
  return {
    job: { status: 'completed', jobKind: 'planning', agentSessionId: null, result: { success: true }, ...overrides },
    newerRunId: null,
    taskPhase: 'planning',
    document: { content: '# Plan\n\nWhat we found' },
    ...rest,
  }
}

describe('decideRunNextStep', () => {
  it("says a fresh plan is ready while it is still the task's latest artifact", () => {
    expect(decideRunNextStep(input())).toEqual({ kind: 'plan_ready', preview: '# Plan\n\nWhat we found' })
  })

  it('says the task moved on once it has a pull request', () => {
    expect(decideRunNextStep(input({}, { taskPhase: 'execution' }))).toEqual({ kind: 'moved_on' })
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

  it('offers to run a cancelled plan again only while the task is still on its plan', () => {
    expect(decideRunNextStep(input({ status: 'cancelled' }))).toEqual({ kind: 'cancelled', canRunAgain: true })
    expect(decideRunNextStep(input({ status: 'cancelled' }, { taskPhase: 'execution' }))).toEqual({
      kind: 'cancelled',
      canRunAgain: false,
    })
  })

  it('asks for a review when a turn wrote the document, and says other turns answered', () => {
    expect(decideRunNextStep(input({ agentSessionId: 'sess-1' })).kind).toBe('plan_ready')

    const noDocument = input({ agentSessionId: 'sess-1' }, { document: { content: '' } })
    expect(decideRunNextStep(noDocument)).toEqual({ kind: 'session', sessionId: 'sess-1' })
    const reply = input({ agentSessionId: 'sess-1', jobKind: 'reply' }, { document: null })
    expect(decideRunNextStep(reply)).toEqual({ kind: 'session', sessionId: 'sess-1' })
  })

  it('points a build turn at its pull request', () => {
    const build = input(
      { agentSessionId: 'sess-1', jobKind: 'execution', result: { success: true, pullRequestUrl: 'https://github.com/a/b/pull/1' } },
      { document: null, taskPhase: 'execution' },
    )
    expect(decideRunNextStep(build)).toEqual({ kind: 'pull_request', url: 'https://github.com/a/b/pull/1' })
  })

  it('reports failure before anything else about a finished run', () => {
    expect(decideRunNextStep(input({ status: 'failed' }))).toEqual({ kind: 'failed' })
  })
})
