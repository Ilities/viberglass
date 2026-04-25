import type { AuthCredentials } from '@viberglass/types'

export interface ShortcutConfig extends AuthCredentials {
  projectId?: string
  workflowStateId?: string
}
