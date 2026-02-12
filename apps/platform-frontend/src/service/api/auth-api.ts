import { API_BASE_URL } from '@/lib'

export type AuthUser = {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
  role?: 'admin' | 'member'
}

type AuthResponse = {
  token: string
  user: AuthUser
}

type MeResponse = {
  user: AuthUser
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T
  }

  const error = await response.json().catch(() => ({}))
  const message = error.error || error.message || 'Request failed'
  throw new Error(message)
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  })

  return handleResponse<AuthResponse>(response)
}

export async function register(name: string, email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, email, password }),
    credentials: 'include',
  })

  return handleResponse<AuthResponse>(response)
}

export async function getCurrentUser(token?: string): Promise<AuthUser> {
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers,
    credentials: 'include',
  })

  const data = await handleResponse<MeResponse>(response)
  return data.user
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to log out')
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to request password reset')
  }
}
