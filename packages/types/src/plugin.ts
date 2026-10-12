/**
 * What every harness and integration plugin says about itself: plain data the
 * backend, the frontend and the build scripts can all read.
 */
export interface PluginManifest {
  /** Unique, kebab-case; stored on the records that use the plugin. */
  id: string
  /** Name shown in the UI and logs. */
  label: string
  /** One sentence shown under the name. */
  description: string
}

/** A `secret` is kept in the secrets system and never sent back to the browser. */
export type PluginFieldType = 'string' | 'number' | 'boolean' | 'select' | 'multiselect' | 'secret'

export interface PluginFieldOption {
  label: string
  value: string
}

/** A setting a plugin takes, rendered as one input of a generic form. */
export interface PluginField {
  /** Where the value is stored. */
  key: string
  label: string
  type: PluginFieldType
  required?: boolean
  description?: string
  options?: PluginFieldOption[]
  placeholder?: string
}
