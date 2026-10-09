import type { AuthCredentials, IntegrationManifest } from '@viberglass/types'
import type { TrackerCommenter } from './TrackerCommenter'
import type { PMIntegration } from './types'
import type { WebhookReceiver } from './webhooks/WebhookReceiver'
import type { RepositoryHost } from './repository/RepositoryHost'

export interface IntegrationPlugin<Config = object> extends IntegrationManifest {
  createIntegration(config: AuthCredentials & Config): PMIntegration
  /** For trackers: posts back to the issues their tasks are linked to, with the connection's credentials. */
  createCommenter?(config: AuthCredentials & Config): TrackerCommenter
  /** Set when the manifest names a `webhookProvider`: how its deliveries are signed, parsed and read. */
  webhook?: WebhookReceiver
  /** Set for a code host: opening pull requests and reading them, and checking a repository. */
  repository?: RepositoryHost
}
