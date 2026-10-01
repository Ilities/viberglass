import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { ApiResponse, AuditEntry, AuditTargetType } from '@viberglass/types'

export interface AuditLogPage {
  entries: AuditEntry[]
  hasMore: boolean
}

/** The workspace audit log, newest first; `before` is the last shown entry's `createdAt`. */
export async function listAuditLog(filters: { actorId?: string; area?: AuditTargetType; before?: string } = {}): Promise<AuditLogPage> {
  const params = new URLSearchParams()
  if (filters.actorId) params.set('actorId', filters.actorId)
  if (filters.area) params.set('area', filters.area)
  if (filters.before) params.set('before', filters.before)
  const response = await apiFetch(`${API_BASE_URL}/api/audit-log?${params.toString()}`)
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to load the audit log')
  const data: ApiResponse<AuditLogPage> = await response.json()
  return data.data
}
