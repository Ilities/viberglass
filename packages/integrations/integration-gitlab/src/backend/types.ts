import type { AuthCredentials } from '@viberglass/types'

export interface GitLabConfig extends AuthCredentials {
  projectId?: string
  projectPath?: string
  labels?: string[]
}
