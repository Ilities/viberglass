import type { JiraConfig } from './types'

const basic = (user: string, secret: string): string => `Basic ${Buffer.from(`${user}:${secret}`).toString('base64')}`

/**
 * The Authorization header for a Jira connection: a Cloud API token signs in
 * with its account's email, a Server or Data Center personal access token
 * on its own, and a password with its user name.
 */
export function jiraAuthorization(config: Pick<JiraConfig, 'email' | 'token' | 'username' | 'password'>): string | null {
  if (config.token && config.email) return basic(config.email, config.token)
  if (config.token) return `Bearer ${config.token}`
  if (config.username && config.password) return basic(config.username, config.password)
  return null
}
