import type { AuthCredentials } from '@viberglass/types'

export interface LinearConfig extends AuthCredentials {
  teamId: string
  workflowStateId?: string
}
