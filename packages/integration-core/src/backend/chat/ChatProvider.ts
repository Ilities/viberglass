import type { AuthCredentials } from '@viberglass/types'
import type { Adapter, Chat } from 'chat'
import type { ChatHandlerServices } from './ChatHandlerServices'

/** A mention of someone in a chat message, as written and whom it names. */
export interface ChatMention {
  text: string
  chatUserId: string
}

/**
 * An integration's chat service, through the chat SDK: its adapter and the
 * handlers people use it with, direct messages, and how its messages write
 * mentions. The platform keeps the bot, the task threads and what is done
 * on tasks; nothing there names a chat service.
 */
export interface ChatProvider {
  /** The SDK adapter's name, stored with each thread, task and audit entry from this service. */
  readonly adapterName: string
  /**
   * Takes the settings and credentials of the integration's connection, null
   * when there is none. Called again whenever the connection changes, before
   * the bot is rebuilt with a new adapter.
   */
  configure(connection: AuthCredentials | null): void
  /** Whether the connection it was given holds what the service needs. */
  isConfigured(): boolean
  /** The SDK adapter, with what `configure` was given; only asked for when configured. */
  createAdapter(): Adapter
  registerHandlers(bot: Chat, services: ChatHandlerServices): void
  /** Posts to a person directly, with a link to open in Viberglass when there is one. */
  sendDirectMessage(chatUserId: string, text: string, link?: { url: string; label: string }): Promise<void>
  /** The person's id on the service. Throws ChatAccountError with what to tell them when it can't be found. */
  findUserByEmail(email: string): Promise<string>
  /** The people a message mentions. */
  mentions(text: string): ChatMention[]
  /** The message without the mention of the bot it starts with. */
  withoutBotMention(text: string): string
}
