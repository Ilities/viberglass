import { JOB_FAILURE_CODE, type JobFailure } from '@viberglass/types'
import { failureGuidance, failureHeadline } from './failure-guidance'

const quota: JobFailure = {
  code: JOB_FAILURE_CODE.AGENT_QUOTA_EXHAUSTED,
  title: 'Model quota used up',
  summary: 'The model provider refused the request because of quota, credit or rate limits.',
  category: 'setup',
  retryable: true,
}

describe('failureGuidance', () => {
  it('sends admins to the fix for setup failures', () => {
    const guidance = failureGuidance(quota, true, 'shop')
    expect(guidance.fix).toEqual({ label: 'Check the model key', href: '/settings/secrets' })
    expect(guidance.title).toBe('Model quota used up')
  })

  it("sends admins to the runner that failed when it's known", () => {
    const guidance = failureGuidance({ ...quota, code: JOB_FAILURE_CODE.AGENT_CREDENTIAL_INVALID }, true, 'shop', { name: 'Codex', slug: 'codex' })
    expect(guidance.fix).toEqual({ label: "Check Codex's model key", href: '/settings/agents/codex' })
    expect(guidance.nextStep).toMatch(/same setup will fail the same way/)
  })

  it("sends admins to the runner's model when a request didn't fit its context", () => {
    const guidance = failureGuidance({ ...quota, code: JOB_FAILURE_CODE.AGENT_CONTEXT_EXCEEDED }, true, 'shop', { name: 'Qwen', slug: 'qwen' })
    expect(guidance.fix).toEqual({ label: "Check Qwen's model", href: '/settings/agents/qwen' })
  })

  it("leads with the agent's own error when the failure is a generic agent one", () => {
    const failure: JobFailure = {
      code: JOB_FAILURE_CODE.AGENT_FAILED,
      title: 'Agent failed',
      summary: 'The agent stopped with an error before finishing.',
      category: 'agent',
      retryable: true,
      technicalDetail: '\n  Internal error: Session too large to compact  \nat stack line',
    }
    expect(failureHeadline(failure).reported).toBe('Internal error: Session too large to compact')
    expect(failureGuidance(failure, false, 'shop').reported).toBe('Internal error: Session too large to compact')
    expect(failureHeadline({ ...failure, technicalDetail: 'x'.repeat(500) }).reported).toHaveLength(200)
  })

  it("keeps the agent's error in the technical details when the failure has a name", () => {
    expect(failureHeadline({ ...quota, technicalDetail: '429 Too Many Requests' }).reported).toBeUndefined()
  })

  it('tells members that an admin is needed, without a fix link', () => {
    const guidance = failureGuidance(quota, false, 'shop')
    expect(guidance.fix).toBeUndefined()
    expect(guidance.nextStep).toMatch(/workspace admin needs to fix the setup/)
  })

  it('links repository failures to the project settings', () => {
    const guidance = failureGuidance(
      { ...quota, code: JOB_FAILURE_CODE.REPOSITORY_ACCESS_FAILED },
      true,
      'shop'
    )
    expect(guidance.fix?.href).toBe('/spaces/shop/settings/repository')
  })

  it('offers a retry, not a setup fix, when the agent failed', () => {
    const guidance = failureGuidance(
      { code: JOB_FAILURE_CODE.AGENT_NO_DOCUMENT, summary: 'No document.', category: 'agent', retryable: true },
      true,
      'shop'
    )
    expect(guidance.fix).toBeUndefined()
    expect(guidance.canRetry).toBe(true)
  })

  it('does not blame setup for a Viberglass problem', () => {
    const guidance = failureGuidance(
      { code: JOB_FAILURE_CODE.RUN_FAILED, summary: 'Unrecognised.', category: 'platform', retryable: true },
      true,
      'shop'
    )
    expect(guidance.fix).toBeUndefined()
    expect(guidance.nextStep).toMatch(/Try again/)
  })

  it('still shows failures recorded before categories existed', () => {
    const guidance = failureGuidance({ code: 'SCM_CREDENTIAL_INVALID', summary: 'Old.', retryable: false }, true, 'shop')
    expect(guidance).toMatchObject({ title: 'Run failed', summary: 'Old.' })
  })
})
