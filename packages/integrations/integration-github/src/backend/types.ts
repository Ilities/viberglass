import type { AuthCredentials } from '@viberglass/types'

export interface GitHubConfig extends AuthCredentials {
  owner: string
  repo: string
  labels?: string[]
}
