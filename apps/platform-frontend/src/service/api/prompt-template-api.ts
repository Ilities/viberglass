import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'

export type PromptType =
  | 'ticket_research'
  | 'ticket_research_revision'
  | 'ticket_planning_with_research'
  | 'ticket_planning_without_research'
  | 'ticket_planning_revision'
  | 'ticket_developing'
  | 'claw_scheduled_task'

export interface PromptTemplateEntry {
  type: PromptType
  label: string
  description: string
  systemDefault: string
  projectOverride: string | null
  effectiveTemplate: string
  isDefault: boolean
}

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => null)
  throw new Error((body?.message || body?.error) ?? fallback)
}

export async function listProjectPromptTemplates(projectId: string): Promise<PromptTemplateEntry[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/projects/${projectId}/prompt-templates`)
  if (!res.ok) return throwApiError(res, 'Failed to fetch prompt templates')
  const data = await res.json()
  return data.data
}

export async function updateProjectPromptTemplate(
  projectId: string,
  type: PromptType,
  template: string,
): Promise<PromptTemplateEntry> {
  const res = await apiFetch(
    `${API_BASE_URL}/api/projects/${projectId}/prompt-templates/${type}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template }),
    },
  )
  if (!res.ok) return throwApiError(res, 'Failed to update prompt template')
  const data = await res.json()
  return data.data
}

export async function deleteProjectPromptTemplate(
  projectId: string,
  type: PromptType,
): Promise<void> {
  const res = await apiFetch(
    `${API_BASE_URL}/api/projects/${projectId}/prompt-templates/${type}`,
    { method: 'DELETE' },
  )
  if (!res.ok) await throwApiError(res, 'Failed to reset prompt template')
}
