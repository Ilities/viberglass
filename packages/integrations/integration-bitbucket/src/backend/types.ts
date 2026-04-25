import type { AuthCredentials } from '@viberglass/types'

export interface BitbucketConfig extends AuthCredentials {
  workspace: string
  repo: string
  projectKey?: string
}
