import { resolveCodexDeviceAuthPrompt } from './codex-device-auth-card'

const required = { details: { kind: 'codex_device_auth_required', verificationUri: 'https://auth.openai.com/codex/device', userCode: 'ABCD-EFGH' } }

describe('resolveCodexDeviceAuthPrompt', () => {
  it('shows the code while sign-in is waiting', () => {
    expect(resolveCodexDeviceAuthPrompt([required], null)).toEqual({
      verificationUri: 'https://auth.openai.com/codex/device',
      userCode: 'ABCD-EFGH',
    })
  })

  it('stops once sign-in has completed', () => {
    expect(resolveCodexDeviceAuthPrompt([required, { details: { kind: 'codex_device_auth_completed' } }], null)).toBeNull()
  })
})
