import type { AuthCredentials } from '@viberglass/types'

/** What the Slack app's connection holds. */
export interface SlackSettings {
  botToken: string
  signingSecret: string
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** The connection's bot token and signing secret, or null until it has both. */
export function slackSettingsFrom(connection: AuthCredentials | null): SlackSettings | null {
  const botToken = text(connection?.botToken)
  const signingSecret = text(connection?.signingSecret)
  return botToken && signingSecret ? { botToken, signingSecret } : null
}
