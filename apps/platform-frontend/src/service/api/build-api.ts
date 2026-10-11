import { API_BASE_URL } from '@/lib'
import type { ApiResponse, TaskPlanPartMark, TaskPlanParts, TaskPullRequest } from '@viberglass/types'
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

async function changeParts(url: string, init: RequestInit, fallback: string): Promise<TaskPlanParts> {
  const response = await apiFetch(url, init)
  if (!response.ok) throw await failure(response, fallback)
  const data: ApiResponse<TaskPlanParts> = await response.json()
  return data.data
}

/** Marks a part done or skipped, when that's known some other way than its pull request merging. */
export function markPlanPart(ticketId: string, part: number, mark: TaskPlanPartMark): Promise<TaskPlanParts> {
  return changeParts(
    `${API_BASE_URL}/api/tasks/${ticketId}/build/parts/${part}/mark`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mark }) },
    "Couldn't mark the part"
  )
}

export function unmarkPlanPart(ticketId: string, part: number): Promise<TaskPlanParts> {
  return changeParts(`${API_BASE_URL}/api/tasks/${ticketId}/build/parts/${part}/mark`, { method: 'DELETE' }, "Couldn't take the mark back")
}

/** Discards the open build that never opened its pull request, so its parts can be built again. */
export function discardBuild(ticketId: string): Promise<TaskPlanParts> {
  return changeParts(`${API_BASE_URL}/api/tasks/${ticketId}/build/discard`, { method: 'POST' }, "Couldn't discard the build")
}

/** The task's pull requests as GitHub has them, oldest first, with their open review comments. */
export async function getBuildPullRequests(ticketId: string): Promise<TaskPullRequest[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/tasks/${ticketId}/build/pull-requests`)
  if (!response.ok) throw await failure(response, 'Failed to read the pull requests')
  const data: ApiResponse<TaskPullRequest[]> = await response.json()
  return data.data
}
