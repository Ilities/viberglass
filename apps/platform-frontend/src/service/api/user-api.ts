import { fieldErrorsOf } from '@/lib/fieldErrors'
import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'

import type { WorkspaceRole } from '@viberglass/types'

export type UserRole = WorkspaceRole

export type ManagedUser = {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  role: UserRole
  createdAt: string
  updatedAt: string
  deactivatedAt: string | null
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

  const fields = fieldErrorsOf(error)
  if (fields) return fields.message

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

export function toErrorFromResponse(error: unknown, fallback: string): Error {
  return new Error(toErrorMessage(error, fallback))
}

async function postUserAction(userId: string, action: 'deactivate' | 'reactivate', fallback: string): Promise<ManagedUser> {
  const response = await apiFetch(`${API_BASE_URL}/api/users/${userId}/${action}`, { method: 'POST' })
  if (!response.ok) {
    throw toErrorFromResponse(await response.json().catch(() => ({})), fallback)
  }
  const data = (await response.json()) as UserResponse
  return data.user
}

export function deactivateUser(userId: string): Promise<ManagedUser> {
  return postUserAction(userId, 'deactivate', 'Failed to deactivate')
}

export function reactivateUser(userId: string): Promise<ManagedUser> {
  return postUserAction(userId, 'reactivate', 'Failed to reactivate')
}

/** A one-time reset link path; shown once, since only its hash is kept. */
export async function createResetLink(userId: string): Promise<string> {
  const response = await apiFetch(`${API_BASE_URL}/api/users/${userId}/reset-link`, { method: 'POST' })
  if (!response.ok) {
    throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to make a reset link')
  }
  const data = (await response.json()) as { path: string }
  return data.path
}

export type Person = Pick<ManagedUser, 'id' | 'email' | 'name' | 'avatarUrl'>

export async function getPeopleDirectory(): Promise<Person[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/users/directory`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(toErrorMessage(error, 'Failed to fetch people'))
  }

  const data = (await response.json()) as { people: Person[] }
  return data.people
}
