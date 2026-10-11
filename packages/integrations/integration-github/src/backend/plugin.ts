import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { checkGitHubConnection } from './checkGitHubConnection'
import { GitHubCommenter } from './GitHubCommenter'
import { GitHubRepositoryHost } from './repository/GitHubRepositoryHost'
import { GitHubWebhookReceiver } from './webhook/GitHubWebhookReceiver'

const githubPlugin: IntegrationPlugin = {
  ...manifest,
  checkConnection: checkGitHubConnection,
  createCommenter: (config) => new GitHubCommenter(config),
  webhook: new GitHubWebhookReceiver(),
  repository: new GitHubRepositoryHost(),
}

export default githubPlugin
