import type { IntegrationPlugin } from '@viberglass/integration-core'
import { manifest } from '../manifest'
import type { AsanaConfig } from './types'

const asanaPlugin: IntegrationPlugin<AsanaConfig> = {
  ...manifest,
  // Lets "Test connection" check the credentials: throw with what went wrong.
  // async checkConnection(config) {
  //   const response = await fetch('https://api.example.com/me', { headers: { Authorization: `Bearer ${config.token}` } })
  //   if (!response.ok) throw new Error(`Asana authentication failed: HTTP ${response.status}`)
  // },
}

export default asanaPlugin
