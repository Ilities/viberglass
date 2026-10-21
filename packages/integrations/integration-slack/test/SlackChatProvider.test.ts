import { createSlackAdapter } from '@chat-adapter/slack'
import { ChatAccountError } from '@viberglass/integration-core'
import type { AuthCredentials } from '@viberglass/types'
import { SlackChatProvider } from '../src/backend/SlackChatProvider'
import { SlackApiError } from '../src/backend/SlackWebApi'

// The chat SDK and its Slack adapter are ESM-only and don't load under Jest; the provider's own logic doesn't need them.
jest.mock('@chat-adapter/slack', () => ({ createSlackAdapter: jest.fn() }), { virtual: true })
jest.mock('chat', () => ({ Modal: jest.fn(), Select: jest.fn(), SelectOption: jest.fn(), TextInput: jest.fn(), ThreadImpl: jest.fn() }), {
  virtual: true,
})

const CONNECTION: AuthCredentials = { type: 'token', botToken: 'xoxb-1', signingSecret: 'secret' }

function provider(connection: AuthCredentials | null = CONNECTION) {
  const api = { postMessage: jest.fn().mockResolvedValue(undefined), lookupUserIdByEmail: jest.fn(), channelMembership: jest.fn(), joinChannel: jest.fn() }
  const createApi = jest.fn(() => api)
  const slack = new SlackChatProvider(createApi)
  slack.configure(connection)
  return { api, createApi, slack }
}

describe('SlackChatProvider', () => {
  beforeEach(() => jest.clearAllMocks())

  it("is set up when its connection holds both the bot token and the signing secret", () => {
    expect(provider().slack.isConfigured()).toBe(true)
    expect(provider({ type: 'token', botToken: 'xoxb-1' }).slack.isConfigured()).toBe(false)
    expect(provider({ type: 'token', botToken: 'xoxb-1', signingSecret: '  ' }).slack.isConfigured()).toBe(false)
    expect(provider(null).slack.isConfigured()).toBe(false)
  })

  it('ignores the environment: only the connection sets it up', () => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-env'
    process.env.SLACK_SIGNING_SECRET = 'env-secret'
    try {
      expect(provider(null).slack.isConfigured()).toBe(false)
    } finally {
      delete process.env.SLACK_BOT_TOKEN
      delete process.env.SLACK_SIGNING_SECRET
    }
  })

  it("builds the adapter and calls Slack with the connection's credentials, and follows a change", () => {
    const { slack, createApi } = provider()
    slack.createAdapter()
    expect(createSlackAdapter).toHaveBeenCalledWith({ botToken: 'xoxb-1', signingSecret: 'secret' })
    expect(createApi).toHaveBeenCalledWith('xoxb-1')

    slack.configure({ type: 'token', botToken: 'xoxb-2', signingSecret: 'other' })
    slack.createAdapter()
    expect(createSlackAdapter).toHaveBeenLastCalledWith({ botToken: 'xoxb-2', signingSecret: 'other' })
    expect(createApi).toHaveBeenLastCalledWith('xoxb-2')
  })

  it('refuses to build an adapter or message anyone once the connection is gone', async () => {
    const { slack } = provider()
    slack.configure(null)
    expect(() => slack.createAdapter()).toThrow("Slack isn't connected")
    await expect(slack.sendDirectMessage('U1', 'hi')).rejects.toThrow("Slack isn't connected")
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
