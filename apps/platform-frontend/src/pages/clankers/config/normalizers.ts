import type { AgentType, CodexAuthMode } from '@viberglass/types'
import type { ProvisioningMode, StrategyName } from './types'

export function normalizeStrategyName(value?: string): StrategyName {
  const normalized = (value || '').toLowerCase()
  if (normalized === 'ecs') return 'ecs'
  if (normalized === 'aws-lambda-container') return 'aws-lambda-container'
  if (normalized === 'lambda') return 'lambda'
  return 'docker'
}

export function toProvisioningMode(value: string): ProvisioningMode {
  return value === 'prebuilt' ? 'prebuilt' : 'managed'
}

export function toCodexAuthMode(value: string): CodexAuthMode {
  if (value === 'chatgpt_device') return 'chatgpt_device'
  if (value === 'chatgpt_device_stored') return 'chatgpt_device_stored'
  return 'api_key'
}

export function toAgentType(value: string): AgentType | '' {
  switch (value) {
    case 'claude-code':
    case 'qwen-cli':
    case 'qwen-api':
    case 'codex':
    case 'opencode':
    case 'kimi-code':
    case 'gemini-cli':
    case 'mistral-vibe':
      return value
    default:
      return ''
  }
}
