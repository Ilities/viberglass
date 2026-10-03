/**
 * Agent skills an admin uploads for the workspace: a folder with a SKILL.md
 * and any files it refers to. Runners pick from them, and the worker puts each
 * picked skill where the agent's harness looks for skills.
 */

export interface Skill {
  id: string
  /** From SKILL.md's frontmatter; also the folder the skill is written to. */
  name: string
  description: string
  fileCount: number
  sizeBytes: number
  createdAt: string
  updatedAt: string
}

/** Lowercase letters, digits and single hyphens, up to 64 characters (the Agent Skills format). */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const SKILL_NAME_MAX_LENGTH = 64

export const SKILL_ENTRY_FILE = 'SKILL.md'

/** The largest upload accepted, zipped or as a single SKILL.md. */
export const SKILL_UPLOAD_MAX_BYTES = 5 * 1024 * 1024

/** A skill in a run's bootstrap payload; the worker fetches its files from the platform. */
export interface WorkerSkill {
  id: string
  name: string
}

/** One of a skill's files, as the worker downloads it. */
export interface SkillFile {
  path: string
  contentBase64: string
}
