import type { ModelHostCredentials } from '@viberglass/types'

export type Fetch = (url: string, init: RequestInit) => Promise<Response>

export class VerdaApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'VerdaApiError'
  }
}

interface CachedToken {
  token: Promise<string>
  expiresAt: number
}

/** Calls the Verda cloud API with an OAuth client-credentials token, cached per client. */
export class VerdaApiClient {
  private readonly tokens = new Map<string, CachedToken>()

  constructor(
    private readonly fetchFn: Fetch = fetch,
    private readonly baseUrl = 'https://api.verda.com/v1',
    private readonly now: () => number = Date.now,
  ) {}

  async request(
    account: ModelHostCredentials,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.token(account)}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
    })
    if (response.status === 401) this.tokens.delete(account.clientId)
    if (!response.ok) throw await this.error(response, `${method} ${path}`)
    const text = await response.text()
    const parsed: unknown = text ? JSON.parse(text) : undefined
    return parsed
  }

  private token(account: ModelHostCredentials): Promise<string> {
    const cached = this.tokens.get(account.clientId)
    if (cached && cached.expiresAt > this.now()) return cached.token
    // Concurrent requests share one sign-in; the expiry is set once it answers.
    const token = this.signIn(account)
    this.tokens.set(account.clientId, { token, expiresAt: Infinity })
    token.catch(() => this.tokens.delete(account.clientId))
    return token
  }

  private async signIn(account: ModelHostCredentials): Promise<string> {
    const response = await this.fetchFn(`${this.baseUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: account.clientId,
        client_secret: account.clientSecret,
      }),
      redirect: 'error',
    })
    if (!response.ok) throw await this.error(response, 'Sign-in')
    const body: unknown = await response.json()
    if (
      typeof body !== 'object' ||
      body === null ||
      !('access_token' in body) ||
      typeof body.access_token !== 'string'
    ) {
      throw new VerdaApiError(response.status, 'Verda returned no access token.')
    }
    const lifetime = 'expires_in' in body && typeof body.expires_in === 'number' ? body.expires_in : 3600
    // Renew a minute early so a request never carries a token that expires in flight.
    const cached = this.tokens.get(account.clientId)
    if (cached) cached.expiresAt = this.now() + (lifetime - 60) * 1000
    return body.access_token
  }

  private async error(response: Response, action: string): Promise<VerdaApiError> {
    const text = await response.text().catch(() => '')
    let message = text.slice(0, 300)
    try {
      const body: unknown = JSON.parse(text)
      if (typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string') {
        message = body.message
      }
    } catch {
      /* Not JSON: keep the raw text. */
    }
    return new VerdaApiError(
      response.status,
      `${action} failed on Verda (HTTP ${response.status})${message ? `: ${message}` : '.'}`,
    )
  }
}
