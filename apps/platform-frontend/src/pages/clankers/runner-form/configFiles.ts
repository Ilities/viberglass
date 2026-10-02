import type { ConfigFileInput } from '@viberglass/types'
import { AGENTS_FILE_TYPE, isSkillPath, normalizeInstructionPath } from '../instructionFiles'
import type { SkillEntry } from './InstructionFilesSection'

/** The runner's config files, or the first problem that keeps them from being saved. */
export function buildConfigFiles(
  agentInstructions: string,
  skills: SkillEntry[],
  harnessConfigFileType: string,
  harnessConfigContent: string,
): { files: ConfigFileInput[]; error: string | null } {
  const files: ConfigFileInput[] = []

  if (agentInstructions.trim()) {
    files.push({ fileType: AGENTS_FILE_TYPE, content: agentInstructions.trim() })
  }

  if (harnessConfigFileType && harnessConfigContent.trim()) {
    files.push({ fileType: harnessConfigFileType, content: harnessConfigContent.trim() })
  }

  const usedSkillPaths = new Set<string>()
  for (const skill of skills) {
    if (!skill.content.trim()) {
      continue
    }

    const normalizedPath = normalizeInstructionPath(skill.path)
    if (!isSkillPath(normalizedPath)) {
      return {
        files: [],
        error: `Invalid skill path "${skill.path}". Use skills/<name>.md or nested paths under skills/.`,
      }
    }

    const dedupeKey = normalizedPath.toLowerCase()
    if (usedSkillPaths.has(dedupeKey)) {
      return {
        files: [],
        error: `Duplicate skill path: ${normalizedPath}`,
      }
    }

    usedSkillPaths.add(dedupeKey)
    files.push({ fileType: normalizedPath, content: skill.content.trim() })
  }

  return { files, error: null }
}
