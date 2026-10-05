import { API_BASE_URL } from '@/lib'
import type { RunRecord, RunRecordPage } from '@viberglass/types'
import { apiFetch } from './client'

export type { RunRecord, RunRecordPage } from '@viberglass/types'

/** Run records across every space, newest first. Admin only. */
export async function listRunRecords(cursor?: string): Promise<RunRecordPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  const response = await apiFetch(`${API_BASE_URL}/api/run-manifests${query}`)
  if (!response.ok) throw new Error('Failed to load run records')
  return response.json()
}

/** One run's record, or null for a run that has none. Anyone who can see the run can read it. */
export async function getRunRecord(jobId: string): Promise<RunRecord | null> {
  const response = await apiFetch(`${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}/record`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Failed to load run record')
  return response.json()
}
