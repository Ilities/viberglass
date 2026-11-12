import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { ApiResponse, OutputsPage, OutputsQuery, OutputsSummary } from '@viberglass/types'

async function read<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), fallback)
  const data: ApiResponse<T> = await response.json()
  return data.data
}

function queryString(query: OutputsQuery): string {
  const params = new URLSearchParams()
  if (query.kind) params.set('kind', query.kind)
  if (query.spaceId) params.set('spaceId', query.spaceId)
  if (query.producer) params.set('producer', query.producer)
  if (query.q) params.set('q', query.q)
  if (query.latest) params.set('latest', 'true')
  if (query.cursor) params.set('cursor', query.cursor)
  const text = params.toString()
  return text ? `?${text}` : ''
}

export async function getOutputs(query: OutputsQuery): Promise<OutputsPage> {
  return read(await apiFetch(`${API_BASE_URL}/api/outputs${queryString(query)}`), "Couldn't load the outputs")
}

export async function getOutputsSummary(query: OutputsQuery): Promise<OutputsSummary> {
  return read(await apiFetch(`${API_BASE_URL}/api/outputs/summary${queryString(query)}`), "Couldn't load the outputs")
}
