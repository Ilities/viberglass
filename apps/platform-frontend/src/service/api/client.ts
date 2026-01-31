import { getStoredAuthToken } from '@/service/auth-storage'

export async function apiFetch(input: RequestInfo, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {})

  if (typeof window !== 'undefined') {
    // Client-side: use token from localStorage/sessionStorage
    const token = getStoredAuthToken()
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  } else {
    // Server-side (SSR): forward the auth cookie from the incoming browser request
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const authCookie = cookieStore.get('auth_token')
    if (authCookie) {
      headers.set('Cookie', `auth_token=${authCookie.value}`)
    }
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  })
}
