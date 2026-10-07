import type { AuthCredentials } from '@viberglass/types'

export interface JiraConfig extends AuthCredentials {
  /** The site, e.g. https://acme.atlassian.net. */
  instanceUrl: string
  /** The account the API token belongs to; Jira Cloud tokens sign in with it. */
  email?: string
  projectKey: string
  issueTypeId?: string
}
