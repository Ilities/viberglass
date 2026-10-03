import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type { ApiResponse, McpServer, McpServerInput } from '@viberglass/types'

async function failure(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  const detail = Array.isArray(body.details) ? body.details.map((d: { message: string }) => d.message).join('; ') : ''
  return new Error(detail || body.error || fallback)
}

export async function listMcpServers(): Promise<McpServer[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/mcp-servers`)
  if (!response.ok) throw await failure(response, "Couldn't load MCP servers")
  const data: ApiResponse<McpServer[]> = await response.json()
  return data.data
}

export async function saveMcpServer(input: McpServerInput, id?: string): Promise<McpServer> {
  const response = await apiFetch(`${API_BASE_URL}/api/mcp-servers${id ? `/${id}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await failure(response, "Couldn't save the MCP server")
  const data: ApiResponse<McpServer> = await response.json()
  return data.data
}

export async function deleteMcpServer(id: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/mcp-servers/${id}`, { method: 'DELETE' })
  if (!response.ok) throw await failure(response, "Couldn't remove the MCP server")
}
