import type { AuthCredentials } from '@viberglass/types'

export interface SlackConfig extends AuthCredentials {
  channelId?: string
  channelName?: string
  channel?: string
}
