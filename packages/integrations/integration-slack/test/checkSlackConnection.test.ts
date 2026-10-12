import { checkSlackConnection } from '../src/backend/checkSlackConnection'
import { SlackApiError } from '../src/backend/SlackWebApi'

describe('checkSlackConnection', () => {
  it('asks for both values before calling Slack', async () => {
    const api = jest.fn()
    await expect(checkSlackConnection({ type: 'token', botToken: 'xoxb-1' }, api)).rejects.toThrow('bot token and signing secret')
    expect(api).not.toHaveBeenCalled()
  })

  it("checks the bot token with Slack's auth.test and says why Slack turned it down", async () => {
    const authTest = jest.fn().mockResolvedValue(undefined)
    const api = jest.fn(() => ({ authTest }))
    await checkSlackConnection({ type: 'token', botToken: 'xoxb-1', signingSecret: 's' }, api)
    expect(api).toHaveBeenCalledWith('xoxb-1')

    authTest.mockRejectedValueOnce(new SlackApiError('auth.test', 'invalid_auth'))
    await expect(checkSlackConnection({ type: 'token', botToken: 'xoxb-1', signingSecret: 's' }, api)).rejects.toThrow(
      'Slack authentication failed: invalid_auth',
    )
  })
})
