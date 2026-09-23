import { JOB_FAILURE_CODE, type JobFailure } from '@viberglass/types'
import { failureGuidance } from './failure-guidance'

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
    expect(guidance.fix).toEqual({ label: 'Check the model key', href: '/secrets' })
    expect(guidance.title).toBe('Model quota used up')
  })

  it('tells members that an admin is needed, without a fix link', () => {
    const guidance = failureGuidance(quota, false, 'shop')
    expect(guidance.fix).toBeUndefined()
    expect(guidance.nextStep).toMatch(/workspace admin needs to fix this/)
  })

  it('links repository failures to the project settings', () => {
    const guidance = failureGuidance(
      { ...quota, code: JOB_FAILURE_CODE.REPOSITORY_ACCESS_FAILED },
      true,
      'shop'
    )
    expect(guidance.fix?.href).toBe('/project/shop/settings')
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
