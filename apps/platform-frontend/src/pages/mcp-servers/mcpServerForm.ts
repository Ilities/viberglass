import { isSecretHeader, type McpServer, type McpServerHeader, type McpServerInput } from '@viberglass/types'

/** A header row as the form edits it: a plain value, or a secret after an optional prefix. */
export interface HeaderRow {
  key: string
  name: string
  kind: 'value' | 'secret'
  value: string
  secretId: string
  prefix: string
}

export interface McpServerFormState {
  name: string
  description: string
  url: string
  headers: HeaderRow[]
}

let rowCount = 0
function rowKey(): string {
  rowCount += 1
  return `header-${rowCount}`
}

/** A new header row; most servers want a bearer token, so a secret after "Bearer " comes first. */
export function newHeaderRow(): HeaderRow {
  return { key: rowKey(), name: 'Authorization', kind: 'secret', value: '', secretId: '', prefix: 'Bearer ' }
}

function rowOf(header: McpServerHeader): HeaderRow {
  return isSecretHeader(header)
    ? { key: rowKey(), name: header.name, kind: 'secret', value: '', secretId: header.secretId, prefix: header.prefix ?? '' }
    : { key: rowKey(), name: header.name, kind: 'value', value: header.value, secretId: '', prefix: '' }
}

export function formStateOf(server?: McpServer): McpServerFormState {
  return {
    name: server?.name ?? '',
    description: server?.description ?? '',
    url: server?.url ?? '',
    headers: server?.headers.map(rowOf) ?? [],
  }
}

/** What to save, or the first thing that keeps the form from being saved. */
export function inputOf(form: McpServerFormState): { input: McpServerInput | null; error: string | null } {
  const headers: McpServerHeader[] = []
  for (const row of form.headers) {
    const name = row.name.trim()
    if (!name) return { input: null, error: 'Every header needs a name.' }
    if (row.kind === 'secret') {
      if (!row.secretId) return { input: null, error: `Pick the secret for the ${name} header.` }
      headers.push({ name, secretId: row.secretId, ...(row.prefix ? { prefix: row.prefix } : {}) })
    } else {
      headers.push({ name, value: row.value })
    }
  }
  return {
    input: { name: form.name.trim(), description: form.description.trim() || null, url: form.url.trim(), headers },
    error: null,
  }
}
