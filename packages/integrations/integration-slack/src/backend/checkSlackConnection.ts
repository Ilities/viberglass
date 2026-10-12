import type { AuthCredentials } from '@viberglass/types'
import { slackSettingsFrom } from './slackSettings'
import { SlackApiError, SlackWebApi } from './SlackWebApi'

/** Both values are entered and Slack's auth.test takes the bot token. */
export async function checkSlackConnection(
  config: AuthCredentials,
  api: (botToken: string) => Pick<SlackWebApi, 'authTest'> = (botToken) => new SlackWebApi(botToken),
): Promise<void> {
  const settings = slackSettingsFrom(config)
  if (!settings) throw new Error('Enter the Slack app\'s bot token and signing secret.')
  await api(settings.botToken)
    .authTest()
    .catch((error: unknown) => {
      const reason = error instanceof SlackApiError ? error.slackError : error instanceof Error ? error.message : String(error)
      throw new Error(`Slack authentication failed: ${reason}`)
    })
}
