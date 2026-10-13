import { field, stringAt } from '@viberglass/integration-core'
import { isObjectRecord } from '@viberglass/types'

/**
 * Rich text with the bot's mentions written as wiki markup's account-id
 * mention, so a mention matches the bot by account ID whatever its display
 * text. Other mentions, and wiki markup itself, are left as they are.
 */
export function withBotMentionsAsAccountIds(value: unknown, botAccountId: string | null): unknown {
  if (!botAccountId || !isObjectRecord(value)) return value
  if (stringAt(value, 'type') === 'mention' && stringAt(field(value, 'attrs'), 'id') === botAccountId) {
    return { type: 'text', text: `[~accountid:${botAccountId}]` }
  }
  const content = field(value, 'content')
  if (!Array.isArray(content)) return value
  return { ...value, content: content.map((node) => withBotMentionsAsAccountIds(node, botAccountId)) }
}
