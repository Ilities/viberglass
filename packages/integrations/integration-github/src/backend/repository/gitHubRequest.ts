import { RepositoryAccessError } from '@viberglass/integration-core'
import { isObjectRecord } from '@viberglass/types'
import { type GitHubApi, restHeaders } from './gitHubApi'

const TIMEOUT_MS = 10_000

export interface GitHubReply {
  status: number
  headers: Headers
  body: unknown
}

/** One REST call with the token; throws RepositoryAccessError when GitHub can't be reached. */
export async function requestGitHub(
  api: GitHubApi,
  path: string,
  token: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<GitHubReply> {
  try {
    const response = await api.fetch(`${api.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...restHeaders(token),
        'User-Agent': 'Viberglass',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? TIMEOUT_MS),
    })
    return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) }
  } catch {
    throw unreachable()
  }
}

export function unreachable(): RepositoryAccessError {
  return new RepositoryAccessError(
    'HOST_UNREACHABLE',
    "Couldn't reach GitHub from this server. Check that the server can make outgoing HTTPS requests, then try again.",
  )
}

/** The rejected-token or rate-limit error for a reply, or null when it's neither. */
export function tokenError(status: number, headers: Headers): RepositoryAccessError | null {
  if (status === 401) {
    return new RepositoryAccessError(
      'TOKEN_REJECTED',
      "GitHub rejected this token. Check that it was copied in full and hasn't expired or been revoked.",
    )
  }
  if (status === 429 || (status === 403 && headers.get('x-ratelimit-remaining') === '0')) {
    return new RepositoryAccessError('HOST_RATE_LIMITED', 'GitHub is rate limiting this token right now. Wait a few minutes, then try again.')
  }
  return null
}

export function readString(value: unknown, key: string): string | undefined {
  const field = isObjectRecord(value) ? value[key] : undefined
  return typeof field === 'string' && field.length > 0 ? field : undefined
}
