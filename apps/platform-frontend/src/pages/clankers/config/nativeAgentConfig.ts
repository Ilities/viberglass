import {
  getNativeAgentConfigDefinition,
  isSupportedNativeAgentConfigAgent,
  type AgentType,
  type ConfigFileInput,
  type NativeAgentConfigSupportedAgent,
} from '@viberglass/types'
import { normalizeInstructionPath } from '../instructionFiles'

function matchesPathShape(agent: NativeAgentConfigSupportedAgent, path: string): boolean {
  const definition = getNativeAgentConfigDefinition(agent)
  if (!definition) {
    return false
  }

  if (agent === 'opencode') {
    return path.endsWith('.json')
  }

  return path === definition.defaultPath || path.endsWith(`/${definition.defaultPath}`)
}

export function isAllowedNativeAgentConfigPath(
  agent: AgentType | '' | null | undefined,
  value: string,
): boolean {
  if (!isSupportedNativeAgentConfigAgent(agent)) {
    return false
  }

  const normalized = normalizeInstructionPath(value)
  const definition = getNativeAgentConfigDefinition(agent)
  if (!normalized || !definition) {
    return false
  }

  const expectedExtension = definition.format === 'toml' ? '.toml' : '.json'
  return normalized.endsWith(expectedExtension) && matchesPathShape(agent, normalized)
}

export function splitClankerConfigFiles(
  agent: AgentType | '' | null | undefined,
  files: ConfigFileInput[],
): { instructionFiles: ConfigFileInput[]; nativeConfigFile: ConfigFileInput | null } {
  const instructionFiles: ConfigFileInput[] = []
  let nativeConfigFile: ConfigFileInput | null = null

  for (const file of files) {
    const normalizedPath = normalizeInstructionPath(file.fileType)
    if (normalizedPath === 'AGENTS.md' || (normalizedPath.startsWith('skills/') && normalizedPath.endsWith('.md'))) {
      instructionFiles.push({ fileType: normalizedPath, content: file.content })
      continue
    }

    if (isAllowedNativeAgentConfigPath(agent, normalizedPath) && nativeConfigFile === null) {
      nativeConfigFile = { fileType: normalizedPath, content: file.content }
    }
  }

  return { instructionFiles, nativeConfigFile }
}
