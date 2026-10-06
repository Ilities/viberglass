import { runName, runsForStep, stepForRun } from './step-runs'

const runs = [
  { jobId: 'code-1', jobKind: 'execution' as const },
  { jobId: 'reply-1', jobKind: 'reply' as const },
  { jobId: 'plan-1', jobKind: 'planning' as const },
  { jobId: 'login', jobKind: 'agent_login' as const },
]

describe('step runs', () => {
  it("lists a step's own runs, and replies under the task's current step", () => {
    expect(runsForStep(runs, 'execution', 'execution').map((run) => run.jobId)).toEqual(['code-1', 'reply-1'])
    expect(runsForStep(runs, 'planning', 'execution').map((run) => run.jobId)).toEqual(['plan-1'])
  })

  it('opens a reply under the current step, and names each run by what it was', () => {
    expect(stepForRun('reply', 'execution')).toBe('execution')
    expect(stepForRun('planning', 'execution')).toBe('planning')
    expect(runName('execution')).toBe('Code run')
    expect(runName('reply')).toBe('Reply run')
    expect(runName('claw')).toBe('Scheduled run')
  })
})
