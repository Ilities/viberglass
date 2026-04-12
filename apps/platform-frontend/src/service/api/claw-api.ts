import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type {
  ClawTaskTemplate,
  ClawTaskTemplateSummary,
  CreateClawTaskTemplateRequest,
  UpdateClawTaskTemplateRequest,
  ClawSchedule,
  ClawScheduleSummary,
  CreateClawScheduleRequest,
  UpdateClawScheduleRequest,
} from '@viberglass/types'

const BASE = `${API_BASE_URL}/api/claw`

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => null)
  throw new Error((body?.message || body?.error) ?? fallback)
}

// Task Templates

export async function getClawTaskTemplates(projectId: string): Promise<ClawTaskTemplateSummary[]> {
  const res = await apiFetch(`${BASE}/task-templates?projectId=${encodeURIComponent(projectId)}&limit=100`)
  if (!res.ok) return throwApiError(res, 'Failed to fetch task templates')
  const data = await res.json()
  return data.data
}

export async function getClawTaskTemplate(id: string): Promise<ClawTaskTemplate> {
  const res = await apiFetch(`${BASE}/task-templates/${id}`)
  if (!res.ok) return throwApiError(res, 'Failed to fetch task template')
  const data = await res.json()
  return data.data
}

export async function createClawTaskTemplate(body: CreateClawTaskTemplateRequest): Promise<ClawTaskTemplate> {
  const res = await apiFetch(`${BASE}/task-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return throwApiError(res, 'Failed to create task template')
  const data = await res.json()
  return data.data
}

export async function updateClawTaskTemplate(id: string, body: UpdateClawTaskTemplateRequest): Promise<ClawTaskTemplate> {
  const res = await apiFetch(`${BASE}/task-templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return throwApiError(res, 'Failed to update task template')
  const data = await res.json()
  return data.data
}

export async function deleteClawTaskTemplate(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/task-templates/${id}`, { method: 'DELETE' })
  if (!res.ok) await throwApiError(res, 'Failed to delete task template')
}

// Schedules

export async function getClawSchedules(projectId: string): Promise<ClawScheduleSummary[]> {
  const res = await apiFetch(`${BASE}/schedules?projectId=${encodeURIComponent(projectId)}&limit=100`)
  if (!res.ok) return throwApiError(res, 'Failed to fetch schedules')
  const data = await res.json()
  return data.data
}

export async function createClawSchedule(body: CreateClawScheduleRequest): Promise<ClawSchedule> {
  const res = await apiFetch(`${BASE}/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return throwApiError(res, 'Failed to create schedule')
  const data = await res.json()
  return data.data
}

export async function updateClawSchedule(id: string, body: UpdateClawScheduleRequest): Promise<ClawSchedule> {
  const res = await apiFetch(`${BASE}/schedules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return throwApiError(res, 'Failed to update schedule')
  const data = await res.json()
  return data.data
}

export async function deleteClawSchedule(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/schedules/${id}`, { method: 'DELETE' })
  if (!res.ok) await throwApiError(res, 'Failed to delete schedule')
}

export async function pauseClawSchedule(id: string): Promise<ClawSchedule> {
  const res = await apiFetch(`${BASE}/schedules/${id}/pause`, { method: 'POST' })
  if (!res.ok) return throwApiError(res, 'Failed to pause schedule')
  const data = await res.json()
  return data.data
}

export async function resumeClawSchedule(id: string): Promise<ClawSchedule> {
  const res = await apiFetch(`${BASE}/schedules/${id}/resume`, { method: 'POST' })
  if (!res.ok) return throwApiError(res, 'Failed to resume schedule')
  const data = await res.json()
  return data.data
}
