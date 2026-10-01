import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { ApiResponse, ApprovalStep, TaskApprovals } from '@viberglass/types'

/** Who may approve each step, as the signed-in person sees it. */
export async function getTaskApprovals(taskId: string): Promise<TaskApprovals> {
  const response = await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/approvals`)
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to load who can approve this task')
  const data: ApiResponse<TaskApprovals> = await response.json()
  return data.data
}

/** Asks these people to review the step: they become its reviewers and get a review request. */
export async function requestStepApproval(taskId: string, step: ApprovalStep, reviewerIds: string[]): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/phases/${step}/request-approval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewerIds }),
  })
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to ask for a review')
}
