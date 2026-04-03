export const AGENTS_FILE_TYPE = 'AGENTS.md'

export interface HarnessConfigFile {
  fileType: string
  label: string
  placeholder: string
}

export const HARNESS_CONFIG_FILES: Record<string, HarnessConfigFile> = {
  opencode: {
    fileType: 'opencode.json',
    label: 'OpenCode Configuration',
    placeholder: `{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-5",
  "provider": {
    "openai": {}
  }
}`,
  },
}

export function getHarnessConfigFile(agentType: string): HarnessConfigFile | undefined {
  return HARNESS_CONFIG_FILES[agentType]
}

export function isHarnessConfigFile(fileType: string): boolean {
  for (const config of Object.values(HARNESS_CONFIG_FILES)) {
    if (config.fileType === fileType) {
      return true
    }
  }
  return false
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
  const cleaned = rawName.trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]/g, '-')
  const withExtension = cleaned.toLowerCase().endsWith('.md') ? cleaned : `${cleaned}.md`

  return `skills/${withExtension}`
}
