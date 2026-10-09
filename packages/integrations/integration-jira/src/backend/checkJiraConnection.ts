import type { AuthCredentials } from '@viberglass/types'
import { jiraAuthorization } from './jiraAuth'
import type { JiraConfig } from './types'

/** Reads the account the credentials belong to on the Jira site. */
export async function checkJiraConnection(config: AuthCredentials & JiraConfig): Promise<void> {
  const authorization = jiraAuthorization(config)
  const response = await fetch(`${config.instanceUrl.replace(/\/$/, '')}/rest/api/2/myself`, {
    headers: { Accept: 'application/json', 'User-Agent': 'viberglass', ...(authorization ? { Authorization: authorization } : {}) },
  }).catch((error: unknown) => {
    throw new Error(`Jira authentication failed: ${error instanceof Error ? error.message : String(error)}`)
  })
  if (!response.ok) throw new Error(`Jira authentication failed: HTTP ${response.status}`)
}
