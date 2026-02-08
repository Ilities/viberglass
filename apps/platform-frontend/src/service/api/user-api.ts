import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'

export type UserRole = 'admin' | 'member'

export type ManagedUser = {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  role: UserRole
  createdAt: string
  updatedAt: string
}

type UserResponse = {
  user: ManagedUser
}

type UsersResponse = {
  users: ManagedUser[]
}

function toErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') {
    return fallback
  }

  if ('error' in error && typeof error.error === 'string' && error.error.trim()) {
    return error.error
  }

  if ('message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }

  return fallback
}

export async function getUsers(): Promise<ManagedUser[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/users`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(toErrorMessage(error, 'Failed to fetch users'))
  }

  const data = (await response.json()) as UsersResponse
  return data.users
}

export async function createUser(input: {
  email: string
  name: string
  password: string
  role: UserRole
}): Promise<ManagedUser> {
  const response = await apiFetch(`${API_BASE_URL}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(toErrorMessage(error, 'Failed to create user'))
  }

  const data = (await response.json()) as UserResponse
  return data.user
}

export async function updateUserRole(userId: string, role: UserRole): Promise<ManagedUser> {
  const response = await apiFetch(`${API_BASE_URL}/api/users/${userId}/role`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(toErrorMessage(error, 'Failed to update user role'))
  }

  const data = (await response.json()) as UserResponse
  return data.user
}
