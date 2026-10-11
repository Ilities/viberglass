import { isObjectRecord, type AuthCredentials } from '@viberglass/types'

/** Slack's auth.test: answers ok for any working token. */
export async function checkSlackConnection(config: AuthCredentials): Promise<void> {
  const response = await fetch(`${config.baseUrl || 'https://slack.com/api'}/auth.test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token || config.apiKey || ''}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: '{}',
  }).catch((error: unknown) => {
    throw new Error(`Slack authentication failed: ${error instanceof Error ? error.message : String(error)}`)
  })
  const body: unknown = await response.json().catch(() => null)
  if (!isObjectRecord(body) || body.ok !== true) {
    const reason = isObjectRecord(body) && typeof body.error === 'string' ? body.error : `HTTP ${response.status}`
    throw new Error(`Slack authentication failed: ${reason}`)
  }
}
