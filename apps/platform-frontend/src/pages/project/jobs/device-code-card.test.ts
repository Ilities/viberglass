import { resolveDeviceCodePrompt } from './device-code-card'

const required = { details: { kind: 'device_code_required', verificationUri: 'https://auth.openai.com/codex/device', userCode: 'ABCD-EFGH' } }

describe('resolveDeviceCodePrompt', () => {
  it('shows the code while sign-in is waiting', () => {
    expect(resolveDeviceCodePrompt([required], null)).toEqual({
      verificationUri: 'https://auth.openai.com/codex/device',
      userCode: 'ABCD-EFGH',
    })
  })

  it('stops once sign-in has completed', () => {
    expect(resolveDeviceCodePrompt([required, { details: { kind: 'device_code_completed' } }], null)).toBeNull()
  })
})
