import { createSlackAdapter } from '@chat-adapter/slack'
import { ChatAccountError, type ChatHandlerServices, type ChatMention, type ChatProvider } from '@viberglass/integration-core'
import type { Chat } from 'chat'
import { registerButtonActionHandlers } from './chat/buttonActions'
import { registerModalSubmitHandler } from './chat/modalSubmit'
import { registerSlashCommandHandler } from './chat/slashCommand'
import { registerThreadMessageHandler } from './chat/threadMessage'
import { SLACK_ADAPTER } from './slackAdapterName'
import { SlackApiError, SlackWebApi } from './SlackWebApi'

/** A Slack mention: `<@U123>` or `<@U123|name>`. */
const SLACK_MENTION = /<@([A-Z0-9]+)(?:\|[^>]*)?>/g
/** How a message to the bot starts: its mention, raw or as the SDK renders it. */
const LEADING_MENTION = /^\s*(<@[A-Z0-9]+(?:\|[^>]*)?>|@\S+)\s*/

const isSet = (value: string | undefined) => Boolean(value && value !== 'not-configured')

/** Slack through the chat SDK, set up by the SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET of the Slack app. */
export class SlackChatProvider implements ChatProvider {
  readonly adapterName = SLACK_ADAPTER

  constructor(
    private readonly api: Pick<SlackWebApi, 'postMessage' | 'lookupUserIdByEmail'> = new SlackWebApi(),
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  isConfigured(): boolean {
    return isSet(this.env.SLACK_BOT_TOKEN) && isSet(this.env.SLACK_SIGNING_SECRET)
  }

  createAdapter() {
    return createSlackAdapter()
  }

  registerHandlers(bot: Chat, services: ChatHandlerServices): void {
    registerSlashCommandHandler(bot, services)
    registerModalSubmitHandler(bot, services)
    registerThreadMessageHandler(bot, services)
    registerButtonActionHandlers(bot, services)
  }

  async sendDirectMessage(chatUserId: string, text: string, link?: { url: string; label: string }): Promise<void> {
    await this.api.postMessage(chatUserId, link ? `${text}\n<${link.url}|${link.label}>` : text)
  }

  async findUserByEmail(email: string): Promise<string> {
    const notFound = new ChatAccountError(404, `No Slack account uses ${email}.`)
    try {
      const chatUserId = await this.api.lookupUserIdByEmail(email)
      if (!chatUserId) throw notFound
      return chatUserId
    } catch (error) {
      if (error instanceof SlackApiError && error.slackError === 'users_not_found') throw notFound
      if (error instanceof SlackApiError && error.slackError === 'missing_scope') {
        throw new ChatAccountError(
          409,
          'The Slack app needs the users:read.email and im:write scopes. Reinstall it from Settings → Connections → Slack.',
        )
      }
      throw error
    }
  }

  mentions(text: string): ChatMention[] {
    return [...text.matchAll(SLACK_MENTION)].map(([mention, chatUserId]) => ({ text: mention, chatUserId }))
  }

  withoutBotMention(text: string): string {
    return text.replace(LEADING_MENTION, '')
  }
}
