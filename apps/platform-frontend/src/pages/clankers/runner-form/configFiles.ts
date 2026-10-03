import type { ConfigFileInput } from '@viberglass/types'
import { AGENTS_FILE_TYPE } from '../instructionFiles'

/** The runner's config files: its AGENTS.md and the agent's own config file, when either has content. */
export function buildConfigFiles(
  agentInstructions: string,
  harnessConfigFileType: string,
  harnessConfigContent: string,
): ConfigFileInput[] {
  const files: ConfigFileInput[] = []

  if (agentInstructions.trim()) {
    files.push({ fileType: AGENTS_FILE_TYPE, content: agentInstructions.trim() })
  }

  if (harnessConfigFileType && harnessConfigContent.trim()) {
    files.push({ fileType: harnessConfigFileType, content: harnessConfigContent.trim() })
  }

  return files
}
