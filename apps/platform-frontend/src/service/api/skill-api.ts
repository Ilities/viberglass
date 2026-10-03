import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type { ApiResponse, Skill } from '@viberglass/types'

async function failure(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  return new Error(body.error || fallback)
}

export async function listSkills(): Promise<Skill[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/skills`)
  if (!response.ok) throw await failure(response, "Couldn't load skills")
  const data: ApiResponse<Skill[]> = await response.json()
  return data.data
}

/** Uploads a skill as a .zip of its folder or its SKILL.md; with an id, as a new version of that skill. */
export async function uploadSkill(file: File, id?: string): Promise<Skill> {
  const form = new FormData()
  form.append('file', file)
  const response = await apiFetch(`${API_BASE_URL}/api/skills${id ? `/${id}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    body: form,
  })
  if (!response.ok) throw await failure(response, "Couldn't upload the skill")
  const data: ApiResponse<Skill> = await response.json()
  return data.data
}

export async function deleteSkill(id: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/skills/${id}`, { method: 'DELETE' })
  if (!response.ok) throw await failure(response, "Couldn't remove the skill")
}
