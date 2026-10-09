import type { IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { GitLabIcon } from './GitLabIcon'
import { manifest } from '../manifest'

const gitlabFrontendPlugin: IntegrationFrontendPlugin = {
  ...manifest,
  Icon: GitLabIcon,
}

export default gitlabFrontendPlugin
