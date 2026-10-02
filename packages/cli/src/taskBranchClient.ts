import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { TaskCodeBranch } from '@viberglass/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTaskCodeBranch(value: unknown): value is TaskCodeBranch {
  return isRecord(value) && typeof value.branch === 'string' && typeof value.repositoryUrl === 'string' && typeof value.baseBranch === 'string'
}

/** Asks Viberglass, with your API token, for a task's branch through its MCP endpoint. */
export async function fetchTaskBranch(platformUrl: string, token: string, task: string): Promise<TaskCodeBranch> {
  const client = new Client({ name: 'viberglass-cli', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL('/api/mcp', platformUrl), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })
  await client.connect(transport)
  try {
    const result = await client.callTool({ name: 'task_branch', arguments: { task } })
    const content = Array.isArray(result.content) ? result.content : []
    const text = content.map((block) => (isRecord(block) && typeof block.text === 'string' ? block.text : '')).join('')
    const parsed: unknown = JSON.parse(text || 'null')
    if (result.isError || !isTaskCodeBranch(parsed)) {
      throw new Error(isRecord(parsed) && typeof parsed.error === 'string' ? parsed.error : `Couldn't find the branch of ${task}`)
    }
    return parsed
  } finally {
    await client.close()
  }
}
