import type { AsanaApiAccess } from '../asanaApiAccess'

type Fetch = typeof fetch

export interface AsanaTaskDetails {
  notes?: string
  name?: string
  completed?: boolean
  tags: string[]
}

/** Asana's task events omit the description, tags and completion, so they're fetched. */
export async function fetchAsanaTask(access: AsanaApiAccess, gid: string, fetchImpl: Fetch = fetch): Promise<AsanaTaskDetails> {
  const response = await fetchImpl(`${access.base}/tasks/${encodeURIComponent(gid)}?opt_fields=notes,name,completed,tags.name`, {
    headers: { Authorization: `Bearer ${access.token}` },
  })
  if (!response.ok) throw new Error(`Asana didn't return task ${gid}: HTTP ${response.status}`)
  const body = (await response.json().catch(() => ({}))) as { data?: Record<string, unknown> }
  const data = body.data ?? {}
  const tags = Array.isArray(data.tags)
    ? data.tags.map((tag: unknown) => (tag && typeof tag === 'object' ? (tag as Record<string, unknown>).name : undefined))
    : []
  return {
    notes: typeof data.notes === 'string' ? data.notes : undefined,
    name: typeof data.name === 'string' ? data.name : undefined,
    completed: typeof data.completed === 'boolean' ? data.completed : undefined,
    tags: tags.filter((name: unknown): name is string => typeof name === 'string' && name.trim() !== ''),
  }
}

/** Asana's comment events carry no text, so it's fetched from the story. */
export async function fetchAsanaStoryText(access: AsanaApiAccess, gid: string, fetchImpl: Fetch = fetch): Promise<string> {
  const response = await fetchImpl(`${access.base}/stories/${encodeURIComponent(gid)}?opt_fields=text`, {
    headers: { Authorization: `Bearer ${access.token}` },
  })
  if (!response.ok) throw new Error(`Asana didn't return comment ${gid}: HTTP ${response.status}`)
  const body = (await response.json().catch(() => ({}))) as { data?: Record<string, unknown> }
  const text = body.data?.text
  return typeof text === 'string' ? text : ''
}
