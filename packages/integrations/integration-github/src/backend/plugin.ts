import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import { GitHubCommenter } from './GitHubCommenter'
import { GitHubIntegration } from './GitHubIntegration'
import { GitHubRepositoryHost } from './repository/GitHubRepositoryHost'
import type { GitHubConfig } from './types'
import { GitHubWebhookReceiver } from './webhook/GitHubWebhookReceiver'

const githubPlugin: IntegrationPlugin<GitHubConfig> = {
  ...manifest,
  createIntegration: (config) => new GitHubIntegration(config),
  createCommenter: (config) => new GitHubCommenter(config),
  webhook: new GitHubWebhookReceiver(),
  repository: new GitHubRepositoryHost(),
}

export default githubPlugin
