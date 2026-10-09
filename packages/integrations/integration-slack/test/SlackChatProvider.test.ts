import { ChatAccountError } from '@viberglass/integration-core'
import { SlackChatProvider } from '../src/backend/SlackChatProvider'
import { SlackApiError } from '../src/backend/SlackWebApi'

// The chat SDK and its Slack adapter are ESM-only and don't load under Jest; the provider's own logic doesn't need them.
jest.mock('@chat-adapter/slack', () => ({ createSlackAdapter: jest.fn() }), { virtual: true })
jest.mock('chat', () => ({ Modal: jest.fn(), Select: jest.fn(), SelectOption: jest.fn(), TextInput: jest.fn(), ThreadImpl: jest.fn() }), {
  virtual: true,
})

function provider(env: NodeJS.ProcessEnv = { SLACK_BOT_TOKEN: 'xoxb', SLACK_SIGNING_SECRET: 'secret' }) {
  const api = { postMessage: jest.fn().mockResolvedValue(undefined), lookupUserIdByEmail: jest.fn() }
  return { api, slack: new SlackChatProvider(api, env) }
}

describe('SlackChatProvider', () => {
  it('is set up when the Slack app\'s bot token and signing secret both are', () => {
    expect(provider().slack.isConfigured()).toBe(true)
    expect(provider({ SLACK_BOT_TOKEN: 'xoxb' }).slack.isConfigured()).toBe(false)
    expect(provider({ SLACK_BOT_TOKEN: 'xoxb', SLACK_SIGNING_SECRET: 'not-configured' }).slack.isConfigured()).toBe(false)
  })

  it('reads Slack mentions, with or without the name', () => {
    expect(provider().slack.mentions('<@UMARIA|maria> and <@UTOMI> please')).toEqual([
      { text: '<@UMARIA|maria>', chatUserId: 'UMARIA' },
      { text: '<@UTOMI>', chatUserId: 'UTOMI' },
    ])
  })

  it('takes the mention of the bot off the start of a message, raw or as the SDK renders it', () => {
    expect(provider().slack.withoutBotMention('<@UBOT> cover Safari too')).toBe('cover Safari too')
    expect(provider().slack.withoutBotMention('@viberglass cover Safari too')).toBe('cover Safari too')
  })

  it('sends a direct message with the link in Slack\'s format', async () => {
    const { api, slack } = provider()
    await slack.sendDirectMessage('U1', 'You were mentioned', { url: 'https://vg/t/1', label: 'Open it in Viberglass' })
    expect(api.postMessage).toHaveBeenCalledWith('U1', 'You were mentioned\n<https://vg/t/1|Open it in Viberglass>')
  })

  it('finds the account by email, and says why it can\'t', async () => {
    const { api, slack } = provider()
    api.lookupUserIdByEmail.mockResolvedValueOnce('U42')
    await expect(slack.findUserByEmail('a@x')).resolves.toBe('U42')

    api.lookupUserIdByEmail.mockRejectedValueOnce(new SlackApiError('users.lookupByEmail', 'users_not_found'))
    await expect(slack.findUserByEmail('a@x')).rejects.toEqual(new ChatAccountError(404, 'No Slack account uses a@x.'))

    api.lookupUserIdByEmail.mockRejectedValueOnce(new SlackApiError('users.lookupByEmail', 'missing_scope'))
    const scope = slack.findUserByEmail('a@x')
    await expect(scope).rejects.toBeInstanceOf(ChatAccountError)
    await expect(scope).rejects.toThrow('users:read.email and im:write')
  })
})
