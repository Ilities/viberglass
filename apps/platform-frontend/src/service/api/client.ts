import { getStoredAuthToken } from '@/service/auth-storage'

export const SERVER_UNREACHABLE_MESSAGE =
  "Can't reach the Viberglass server. It may still be starting; try again in a moment. If this keeps happening, check that the backend container is running."

/** The request never got a response: the server is down, restarting, or not reachable. */
export class ServerUnreachableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super(SERVER_UNREACHABLE_MESSAGE, options)
    this.name = 'ServerUnreachableError'
  }
}

/** `fetch`, but a request that gets no response throws ServerUnreachableError. */
export async function fetchOrExplain(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (error) {
    // Browsers report network failures as a TypeError ("Failed to fetch",
    // "Load failed"). Aborted requests are DOMExceptions and pass through.
    if (error instanceof TypeError) {
      throw new ServerUnreachableError({ cause: error })
    }
    throw error
  }
}

export async function apiFetch(input: RequestInfo, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {})

  const token = getStoredAuthToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetchOrExplain(input, {
    ...init,
    headers,
    credentials: 'include',
  })
}
