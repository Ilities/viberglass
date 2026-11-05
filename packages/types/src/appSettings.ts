import type { AppManifestSetting } from './appContract'

/** A value an App space's maintainers set for its app, which reads it from its environment. */
export interface AppSetting {
  name: string
  secret: boolean
  /** Null for a secret: its value is never shown again. */
  value: string | null
  /** Whether previews get it too; plain settings always go to previews. */
  forPreviews: boolean
  updatedAt: string
}

export interface AppSettingsView {
  settings: AppSetting[]
  /** What the current release's manifest says it reads, or the newest ready release's. */
  declared: AppManifestSetting[]
  /** Declared settings that have no value. */
  missing: string[]
}

export interface SaveAppSettingRequest {
  secret: boolean
  /** Required for a plain setting and a new secret; leaving it out of a secret keeps its value. */
  value?: string
  forPreviews?: boolean
}
