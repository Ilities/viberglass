import { getHarnessConfigEditor, type AgentType } from '@viberglass/types'
import { formatReference } from './config/harnessReferences'

export const AGENTS_FILE_TYPE = 'AGENTS.md'

export interface HarnessConfigFile {
  fileType: string
  label: string
  /** How the file refers to an env var, with NAME in its place. */
  envReferences: string[]
  /** How the file refers to an attached secret, shown next to the editor. */
  referenceHint: string
  placeholder: string
}

export function getHarnessConfigFile(agentType: AgentType | ''): HarnessConfigFile | undefined {
  const editor = agentType ? getHarnessConfigEditor(agentType) : null
  if (!editor) return undefined
  return {
    fileType: editor.fileType,
    label: editor.label,
    envReferences: editor.envReferences,
    referenceHint: `Refer to an attached secret as ${formatReference(editor.envReferences, 'SECRET_NAME')}.`,
    placeholder: editor.template,
  }
}
