import { isObjectRecord } from './clankerConfig'

/** An interactive sign-in a harness supports besides API keys, such as a ChatGPT account for Codex. */
export interface AgentSignInMethod {
  /** Stored on the runners that use it. */
  id: string
  /** What a person signs in with, e.g. "ChatGPT account". */
  label: string
  /** How a person signs in: a device code is the only kind so far. */
  kind: 'device_code'
  /** The env var the worker hands the runner's stored login to the harness in. */
  credentialEnvVar: string
}

/** The sign-in a runner chose, on its agent config. Without one it uses an API key. */
export interface AgentSignIn {
  method: string
  /** The runner's stored login, set once it has signed in. */
  loginSecretId?: string
}

/** Marks a stored login gzipped and base64-encoded to fit a store's size limit, such as SSM's. */
export const STORED_LOGIN_GZIP_PREFIX = 'gz+b64:'

/** `details.kind` of the progress a harness reports while a device-code sign-in waits for a person. */
export const DEVICE_CODE_PROGRESS = {
  /** With `verificationUri` and `userCode`. */
  required: 'device_code_required',
  /** Repeats the code while it waits. */
  pending: 'device_code_pending',
  completed: 'device_code_completed',
} as const

function readSignInMethod(value: unknown): AgentSignInMethod[] {
  if (!isObjectRecord(value) || value.kind !== 'device_code') return []
  const { id, label, credentialEnvVar } = value
  if (typeof id !== 'string' || typeof label !== 'string' || typeof credentialEnvVar !== 'string') return []
  return [{ id, label, kind: value.kind, credentialEnvVar }]
}

/** The sign-in methods a catalog entry declares; anything malformed is left out. */
export function readSignInMethods(value: unknown): AgentSignInMethod[] {
  return Array.isArray(value) ? value.flatMap(readSignInMethod) : []
}

/** A stored agent config's sign-in, if it names a method. */
export function readAgentSignIn(value: unknown): AgentSignIn | undefined {
  if (!isObjectRecord(value) || typeof value.method !== 'string' || !value.method) return undefined
  const loginSecretId = typeof value.loginSecretId === 'string' && value.loginSecretId ? value.loginSecretId : undefined
  return { method: value.method, ...(loginSecretId ? { loginSecretId } : {}) }
}
