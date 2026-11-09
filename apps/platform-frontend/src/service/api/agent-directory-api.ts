import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type { AgentDirectoryEntry, ApiResponse } from '@viberglass/types'

/** The workspace's agents without their configuration. Guests don't see agents, so for them there are none. */
export async function getAgentDirectory(): Promise<AgentDirectoryEntry[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/agents`)
  if (response.status === 403) return []
  if (!response.ok) throw new Error("Couldn't load the agents")
  const body: ApiResponse<AgentDirectoryEntry[]> = await response.json()
  return body.data
}
