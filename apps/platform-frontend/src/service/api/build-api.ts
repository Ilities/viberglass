import { API_BASE_URL } from '@/lib'
import type { ApiResponse, TaskPlanParts, TaskPullRequest } from '@viberglass/types'
import { apiFetch } from './client'

export type { BuildPullRequest, PullRequestReviewComment, TaskPullRequest } from '@viberglass/types'

async function failure(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  return new Error(body.error || body.message || fallback)
}

/** The task's plan part by part, from its pull requests, and what can be built next. */
export async function getTaskPlanParts(ticketId: string): Promise<TaskPlanParts> {
  const response = await apiFetch(`${API_BASE_URL}/api/tasks/${ticketId}/build/parts`)
  if (!response.ok) throw await failure(response, "Failed to read the plan's parts")
  const data: ApiResponse<TaskPlanParts> = await response.json()
  return data.data
}

/** The task's pull requests as GitHub has them, oldest first, with their open review comments. */
export async function getBuildPullRequests(ticketId: string): Promise<TaskPullRequest[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/tasks/${ticketId}/build/pull-requests`)
  if (!response.ok) throw await failure(response, 'Failed to read the pull requests')
  const data: ApiResponse<TaskPullRequest[]> = await response.json()
  return data.data
}
