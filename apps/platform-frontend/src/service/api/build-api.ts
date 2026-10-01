import { API_BASE_URL } from '@/lib'
import type { ApiResponse, BuildPullRequest, Ticket } from '@viberglass/types'
import { apiFetch } from './client'

export type { BuildPullRequest, PullRequestReviewComment } from '@viberglass/types'

async function failure(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  return new Error(body.error || body.message || fallback)
}

/** The task's pull request as GitHub has it, and its open review comments. */
export async function getBuildPullRequest(ticketId: string): Promise<BuildPullRequest> {
  const response = await apiFetch(`${API_BASE_URL}/api/tasks/${ticketId}/build/pull-request`)
  if (!response.ok) throw await failure(response, 'Failed to read the pull request')
  const data: ApiResponse<BuildPullRequest> = await response.json()
  return data.data
}

/** Take the task back to research or the plan; later steps need approving again. */
export async function reopenTaskStep(ticketId: string, step: 'research' | 'planning'): Promise<Ticket> {
  const response = await apiFetch(`${API_BASE_URL}/api/tasks/${ticketId}/phases/${step}/reopen`, { method: 'POST' })
  if (!response.ok) throw await failure(response, `Failed to reopen the ${step === 'planning' ? 'plan' : 'research'}`)
  const data: ApiResponse<Ticket> = await response.json()
  return data.data
}
