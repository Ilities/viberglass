import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import type { __PascalName__Config } from './types'

const __name__Plugin: IntegrationPlugin<__PascalName__Config> = {
  ...manifest,
  // Lets "Test connection" check the credentials: throw with what went wrong.
  // async checkConnection(config) {
  //   const response = await fetch('https://api.example.com/me', { headers: { Authorization: `Bearer ${config.token}` } })
  //   if (!response.ok) throw new Error(`__DISPLAY_NAME__ authentication failed: HTTP ${response.status}`)
  // },
}

export default __name__Plugin
