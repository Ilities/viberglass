import { createSlackAdapter } from '@chat-adapter/slack'
import { ChatAccountError, type ChatHandlerServices, type ChatMention, type ChatProvider } from '@viberglass/integration-core'
import type { AuthCredentials } from '@viberglass/types'
import type { Chat } from 'chat'
import { registerButtonActionHandlers } from './chat/buttonActions'
import { registerModalSubmitHandler } from './chat/modalSubmit'
import { botInChannel } from './chat/botInChannel'
import { registerSlashCommandHandler } from './chat/slashCommand'
import { registerThreadMessageHandler } from './chat/threadMessage'
import { SLACK_ADAPTER } from './slackAdapterName'
import { slackSettingsFrom, type SlackSettings } from './slackSettings'
import { SlackApiError, SlackWebApi } from './SlackWebApi'

/** A Slack mention: `<@U123>` or `<@U123|name>`. */
const SLACK_MENTION = /<@([A-Z0-9]+)(?:\|[^>]*)?>/g
/** How a message to the bot starts: its mention, raw or as the SDK renders it. */
const LEADING_MENTION = /^\s*(<@[A-Z0-9]+(?:\|[^>]*)?>|@\S+)\s*/

type SlackApi = Pick<SlackWebApi, 'postMessage' | 'lookupUserIdByEmail' | 'channelMembership' | 'joinChannel'>

/** Slack through the chat SDK, with the bot token and signing secret the Slack connection holds. */
export class SlackChatProvider implements ChatProvider {
  readonly adapterName = SLACK_ADAPTER
  private settings: SlackSettings | null = null
  private api: SlackApi | null = null

  constructor(private readonly createApi: (botToken: string) => SlackApi = (botToken) => new SlackWebApi(botToken)) {}

  configure(connection: AuthCredentials | null): void {
    this.settings = slackSettingsFrom(connection)
    this.api = this.settings ? this.createApi(this.settings.botToken) : null
  }

  isConfigured(): boolean {
    return this.settings !== null
  }

  createAdapter() {
    const { botToken, signingSecret } = this.connected().settings
    return createSlackAdapter({ botToken, signingSecret })
  }

  registerHandlers(bot: Chat, services: ChatHandlerServices): void {
    registerSlashCommandHandler(bot, services, (channel) => botInChannel(this.connected().api, channel))
    registerModalSubmitHandler(bot, services)
    registerThreadMessageHandler(bot, services)
    registerButtonActionHandlers(bot, services)
  }

  async sendDirectMessage(chatUserId: string, text: string, link?: { url: string; label: string }): Promise<void> {
    await this.connected().api.postMessage(chatUserId, link ? `${text}\n<${link.url}|${link.label}>` : text)
  }

  async findUserByEmail(email: string): Promise<string> {
    const notFound = new ChatAccountError(404, `No Slack account uses ${email}.`)
    try {
      const chatUserId = await this.connected().api.lookupUserIdByEmail(email)
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

  private connected(): { settings: SlackSettings; api: SlackApi } {
    if (!this.settings || !this.api) throw new Error("Slack isn't connected: its connection needs the bot token and signing secret.")
    return { settings: this.settings, api: this.api }
  }
}
