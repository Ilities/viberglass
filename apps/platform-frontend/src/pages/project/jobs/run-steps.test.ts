import type { ProgressUpdate } from '@/service/api/job-api'
import { buildRunSteps, isStartingSandbox } from './run-steps'

function update(step: string, minute: number): ProgressUpdate {
  return { step, message: step, details: null, createdAt: `2026-09-30T10:${String(minute).padStart(2, '0')}:00Z` }
}

const states = (steps: ReturnType<typeof buildRunSteps>) => steps.map((step) => step.state)

describe('buildRunSteps', () => {
  it('marks every step done for a completed run, even if the worker never reported finishing', () => {
    const steps = buildRunSteps({ status: 'completed', progressUpdates: [update('clone', 1), update('execute', 2)] })
    expect(states(steps)).toEqual(['done', 'done', 'done'])
  })

  it('follows a running run to its current step, whatever order the updates arrive in', () => {
    const progressUpdates = [update('execute', 3), update('initialize', 1), update('clone', 2)]
    const steps = buildRunSteps({ status: 'active', progressUpdates })
    expect(states(steps)).toEqual(['done', 'current', 'upcoming'])
    expect(steps[0].startedAt).toBe('2026-09-30T10:01:00Z')
  })

  it('shows a run that has just started as preparing', () => {
    expect(states(buildRunSteps({ status: 'active', progressUpdates: [] }))).toEqual(['current', 'upcoming', 'upcoming'])
  })

  it('marks the step a run failed in, and the rest as not reached', () => {
    const steps = buildRunSteps({ status: 'failed', progressUpdates: [update('clone', 1), update('execute', 2), update('failed', 3)] })
    expect(states(steps)).toEqual(['done', 'failed', 'not_reached'])
  })

  it('marks where a cancelled run stopped', () => {
    const steps = buildRunSteps({ status: 'cancelled', progressUpdates: [update('initialize', 1)] })
    expect(states(steps)).toEqual(['stopped', 'not_reached', 'not_reached'])
  })

  it('is preparing while queued, since the sandbox is starting', () => {
    expect(states(buildRunSteps({ status: 'queued', progressUpdates: [] }))).toEqual(['current', 'upcoming', 'upcoming'])
  })

  it('says the sandbox is starting until the worker first reports', () => {
    expect(isStartingSandbox({ status: 'queued', progressUpdates: [] })).toBe(true)
    expect(isStartingSandbox({ status: 'active', progressUpdates: [] })).toBe(true)
    expect(isStartingSandbox({ status: 'active', progressUpdates: [update('initialize', 1)] })).toBe(false)
    expect(isStartingSandbox({ status: 'failed', progressUpdates: [] })).toBe(false)
  })
})
