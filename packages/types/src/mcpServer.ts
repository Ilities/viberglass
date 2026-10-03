/**
 * MCP servers an admin approves for the workspace. Runners pick from them, and
 * the agent gets each picked server's tools over HTTP.
 */

/** A request header the server needs: a plain value, or a secret's value after an optional prefix such as "Bearer ". */
export type McpServerHeader =
  | { name: string; value: string }
  | { name: string; secretId: string; prefix?: string }

export interface McpServer {
  id: string
  /** What the agent knows the server's tools by; unique in the workspace. */
  name: string
  description?: string | null
  url: string
  headers: McpServerHeader[]
  createdAt: string
  updatedAt: string
}

export interface McpServerInput {
  name: string
  description?: string | null
  url: string
  headers?: McpServerHeader[]
}

/** Lowercase letters, digits, `-` and `_`: harnesses prefix tool names with it. */
export const MCP_SERVER_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/

/** Names the worker uses for its own MCP servers. */
export const RESERVED_MCP_SERVER_NAMES = ['viberglass']

/** HTTP header names (RFC 9110 tokens). */
export const HTTP_HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

/** The worker reads secret header values from env vars with this prefix, and never passes them to the agent. */
export const MCP_HEADER_ENV_VAR_PREFIX = 'VIBERGLASS_MCP_'

/**
 * A header as a run's worker receives it. A secret value comes as the env var
 * the worker finds it under, so the payload never holds it.
 */
export type WorkerMcpServerHeader =
  | { name: string; value: string }
  | { name: string; envVar: string; prefix?: string }

/** An MCP server in a run's bootstrap payload. */
export interface WorkerMcpServer {
  name: string
  url: string
  headers: WorkerMcpServerHeader[]
}

export function isSecretHeader(header: McpServerHeader): header is { name: string; secretId: string; prefix?: string } {
  return 'secretId' in header
}
