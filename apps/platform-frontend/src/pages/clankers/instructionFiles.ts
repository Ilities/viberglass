import { getAgentHarnessConfigFiles, HARNESS_CONFIG_FILE_TYPES, type AgentType } from '@viberglass/types'

export const AGENTS_FILE_TYPE = 'AGENTS.md'

export interface HarnessConfigFile {
  fileType: string
  label: string
  /** How the file refers to an attached secret, shown next to the editor. */
  referenceHint: string
  placeholder: string
}

// Templates name OPENAI_API_KEY because only model-provider variables reach the agent.
const HARNESS_CONFIG_TEMPLATES: Record<string, Omit<HarnessConfigFile, 'fileType'>> = {
  'opencode.json': {
    label: 'OpenCode Configuration',
    referenceHint: 'Refer to an attached secret as {env:SECRET_NAME}.',
    placeholder: `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "my-proxy": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://llm-proxy.example.com/v1",
        "apiKey": "{env:OPENAI_API_KEY}"
      },
      "models": {
        "my-model": { "name": "My model" }
      }
    }
  }
}`,
  },
  'pi/models.json': {
    label: 'Pi Models (models.json)',
    referenceHint: 'Refer to an attached secret as $SECRET_NAME.',
    placeholder: `{
  "providers": {
    "my-proxy": {
      "baseUrl": "https://llm-proxy.example.com/v1",
      "api": "openai-completions",
      "apiKey": "$OPENAI_API_KEY",
      "models": [{ "id": "my-model" }]
    }
  }
}`,
  },
}

export function getHarnessConfigFile(agentType: AgentType | ''): HarnessConfigFile | undefined {
  if (!agentType) {
    return undefined
  }
  const fileType = getAgentHarnessConfigFiles(agentType).find((candidate) => candidate in HARNESS_CONFIG_TEMPLATES)
  return fileType ? { fileType, ...HARNESS_CONFIG_TEMPLATES[fileType] } : undefined
}

export function isHarnessConfigFile(fileType: string): boolean {
  return HARNESS_CONFIG_FILE_TYPES.includes(fileType)
}

function toForwardSlashes(value: string): string {
  return value.replace(/\\/g, '/')
}

export function normalizeInstructionPath(value: string): string {
  const trimmed = toForwardSlashes(value.trim())
  const parts = trimmed.split('/').filter((part) => part.length > 0 && part !== '.')
  const normalized: string[] = []

  for (const part of parts) {
    if (part === '..') {
      return ''
    }
    normalized.push(part)
  }

  return normalized.join('/')
}

export function isAllowedInstructionPath(value: string): boolean {
  const normalized = normalizeInstructionPath(value)
  if (!normalized) {
    return false
  }

  if (normalized === AGENTS_FILE_TYPE) {
    return true
  }

  if (isHarnessConfigFile(normalized)) {
    return true
  }

  return normalized.startsWith('skills/') && normalized.endsWith('.md')
}

export function isSkillPath(value: string): boolean {
  const normalized = normalizeInstructionPath(value)
  return normalized.startsWith('skills/') && normalized.endsWith('.md')
}

export function skillPathFromUploadName(fileName: string): string {
  const rawName = fileName.split('/').pop()?.split('\\').pop() || 'skill.md'
  const cleaned = rawName
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
  const withExtension = cleaned.toLowerCase().endsWith('.md') ? cleaned : `${cleaned}.md`

  return `skills/${withExtension}`
}
