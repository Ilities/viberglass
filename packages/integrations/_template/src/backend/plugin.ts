import type { IntegrationPlugin } from '@viberglass/integration-core'
import type { __PascalName__Config } from './types'
import { __PascalName__Integration } from './__PascalName__Integration'

const __name__Plugin: IntegrationPlugin<__PascalName__Config> = {
  id: '__name__',
  label: '__DISPLAY_NAME__',
  category: 'ticketing', // Change to 'scm' or 'inbound' as appropriate
  authTypes: ['token'],
  configFields: [
    // TODO: define configuration fields
    // Example:
    // {
    //   key: 'apiKey',
    //   label: 'API Key',
    //   type: 'password',
    //   required: true,
    //   description: 'Your __DISPLAY_NAME__ API key',
    // },
  ],
  supports: {
    issues: true,
    webhooks: false,
    pullRequests: false,
  },
  createIntegration(config) {
    return new __PascalName__Integration(config)
  },
}

export default __name__Plugin
