import { botInChannel, INVITE_BOT_MESSAGE } from '../src/backend/chat/botInChannel'
import { SlackApiError } from '../src/backend/SlackWebApi'

function api(membership: { isMember: boolean; isPrivate: boolean } | Error, join: Error | null = null) {
  return {
    channelMembership: membership instanceof Error ? jest.fn().mockRejectedValue(membership) : jest.fn().mockResolvedValue(membership),
    joinChannel: join ? jest.fn().mockRejectedValue(join) : jest.fn().mockResolvedValue(undefined),
  }
}

describe('botInChannel', () => {
  it('lets the task start where the bot already is', async () => {
    const slack = api({ isMember: true, isPrivate: false })
    await expect(botInChannel(slack, 'C1')).resolves.toBeNull()
    expect(slack.joinChannel).not.toHaveBeenCalled()
  })

  it('joins a public channel by itself', async () => {
    const slack = api({ isMember: false, isPrivate: false })
    await expect(botInChannel(slack, 'C1')).resolves.toBeNull()
    expect(slack.joinChannel).toHaveBeenCalledWith('C1')
  })

  it('asks for an invite to a private channel, which it can\'t join', async () => {
    const slack = api({ isMember: false, isPrivate: true })
    await expect(botInChannel(slack, 'G1')).resolves.toBe(INVITE_BOT_MESSAGE)
    expect(slack.joinChannel).not.toHaveBeenCalled()
  })

  it('asks for an invite when the app was installed without channels:join', async () => {
    const slack = api({ isMember: false, isPrivate: false }, new SlackApiError('conversations.join', 'missing_scope'))
    await expect(botInChannel(slack, 'C1')).resolves.toBe(INVITE_BOT_MESSAGE)
  })

  it("asks for an invite to a channel it can't see, such as someone else's DM", async () => {
    const slack = api(new SlackApiError('conversations.info', 'channel_not_found'))
    await expect(botInChannel(slack, 'D1')).resolves.toBe(INVITE_BOT_MESSAGE)
  })

  it('passes other failures on', async () => {
    const slack = api(new SlackApiError('conversations.info', 'ratelimited'))
    await expect(botInChannel(slack, 'C1')).rejects.toThrow('ratelimited')
  })
})
