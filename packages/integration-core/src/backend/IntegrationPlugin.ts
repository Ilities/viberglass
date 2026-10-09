import type { AuthCredentials, IntegrationManifest } from '@viberglass/types'
import type { TrackerCommenter } from './TrackerCommenter'
import type { WebhookReceiver } from './webhooks/WebhookReceiver'
import type { RepositoryHost } from './repository/RepositoryHost'
import type { ChatProvider } from './chat/ChatProvider'

export interface IntegrationPlugin<Config = object> extends IntegrationManifest {
  /** Checks the connection's credentials work; throws with what went wrong. Unset when there's nothing to check. */
  checkConnection?(config: AuthCredentials & Config): Promise<void>
  /** For trackers: posts back to the issues their tasks are linked to, with the connection's credentials. */
  createCommenter?(config: AuthCredentials & Config): TrackerCommenter
  /** Set when the manifest names a `webhookProvider`: how its deliveries are signed, parsed and read. */
  webhook?: WebhookReceiver
  /** Set for a code host: opening pull requests and reading them, and checking a repository. */
  repository?: RepositoryHost
  /** Set for a chat service: following and starting tasks there, and direct messages. */
  chat?: ChatProvider
}
