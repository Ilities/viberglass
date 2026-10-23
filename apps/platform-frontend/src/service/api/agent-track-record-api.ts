import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { AgentTrackRecord, ApiResponse } from '@viberglass/types'

/** How the agents' tasks in the space went, one entry per harness and model. */
export async function getAgentTrackRecord(spaceId: string): Promise<AgentTrackRecord> {
  const response = await apiFetch(`${API_BASE_URL}/api/spaces/${spaceId}/agent-track-record`)
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), "Couldn't load the agents' track record")
  const data: ApiResponse<AgentTrackRecord> = await response.json()
  return data.data
}
