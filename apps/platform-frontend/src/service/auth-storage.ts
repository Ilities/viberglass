const AUTH_TOKEN_KEY = 'auth_token'

export function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  return localStorage.getItem(AUTH_TOKEN_KEY) ?? sessionStorage.getItem(AUTH_TOKEN_KEY)
}

export function setStoredAuthToken(token: string, remember: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  if (remember) {
    localStorage.setItem(AUTH_TOKEN_KEY, token)
    sessionStorage.removeItem(AUTH_TOKEN_KEY)
  } else {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token)
    localStorage.removeItem(AUTH_TOKEN_KEY)
  }
}

export function clearStoredAuthToken(): void {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.removeItem(AUTH_TOKEN_KEY)
  sessionStorage.removeItem(AUTH_TOKEN_KEY)
}
