import type { AuthCredentials } from '@viberglass/types'

export interface JiraConfig extends AuthCredentials {
  instanceUrl: string
  projectKey: string
  issueTypeId?: string
}
