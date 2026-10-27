import { isObjectRecord } from './clankerConfig'
import type { PluginField, PluginFieldOption } from './plugin'

/** A harness setting on the runner form. Its value is a string, stored on the runner's agent config under `key`. */
export interface AgentSettingField extends PluginField {
  type: 'string' | 'select'
  /** A select also offers "Custom", with a free-text input. */
  allowCustom?: boolean
  /** Takes the chosen model provider's default model or endpoint when the provider changes. */
  providerDefault?: 'model' | 'endpoint'
  /** Env vars the worker sets to the value, for the harness to read. */
  env: string[]
}

/** A config file the runner form edits for a harness. */
export interface HarnessConfigEditor {
  /** One of the harness's config file patterns. */
  fileType: string
  label: string
  /** How the file refers to an env var, with NAME in its place; the editor writes the first. */
  envReferences: string[]
  /** Shown in an empty editor. */
  template: string
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readOptions(value: unknown): PluginFieldOption[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((option) =>
    isObjectRecord(option) && typeof option.value === 'string' && typeof option.label === 'string'
      ? [{ value: option.value, label: option.label }]
      : [],
  )
}

function readSettingField(value: unknown): AgentSettingField[] {
  if (!isObjectRecord(value) || typeof value.key !== 'string' || typeof value.label !== 'string') return []
  if ((value.type !== 'string' && value.type !== 'select') || !isStringArray(value.env)) return []
  const providerDefault = value.providerDefault === 'model' || value.providerDefault === 'endpoint' ? value.providerDefault : undefined
  const options = readOptions(value.options)
  const description = optionalString(value.description)
  const placeholder = optionalString(value.placeholder)
  return [
    {
      key: value.key,
      label: value.label,
      type: value.type,
      env: value.env,
      ...(description ? { description } : {}),
      ...(placeholder ? { placeholder } : {}),
      ...(options ? { options } : {}),
      ...(value.allowCustom === true ? { allowCustom: true } : {}),
      ...(providerDefault ? { providerDefault } : {}),
    },
  ]
}

/** The settings a catalog entry declares; anything malformed is left out. */
export function readSettingFields(value: unknown): AgentSettingField[] {
  return Array.isArray(value) ? value.flatMap(readSettingField) : []
}

// Keys the agent config already uses for something else.
const RESERVED_SETTING_KEYS = new Set(['type', 'signIn'])

/**
 * A plugin's settings, validated for the runner form; throws naming the plugin and the setting key.
 * A `string` renders as a plain text input, so it ignores `options`/`allowCustom`; a `select` with no
 * options renders an empty dropdown. Both are mistakes a plugin author can't see on the form.
 */
export function checkedSettings(packageName: string, raw: unknown): AgentSettingField[] {
  if (raw === undefined) return []
  const settings = readSettingFields(raw)
  if (!Array.isArray(raw) || settings.length !== raw.length) {
    throw new Error(`Plugin ${packageName} has a malformed setting: each needs a key, a label, a type of string or select, and env.`)
  }
  const keys = new Set<string>()
  for (const setting of settings) {
    if (RESERVED_SETTING_KEYS.has(setting.key) || keys.has(setting.key)) {
      throw new Error(`Plugin ${packageName} can't use the setting key '${setting.key}': it's reserved or used twice.`)
    }
    keys.add(setting.key)
    if (setting.type === 'string' && (setting.options !== undefined || setting.allowCustom !== undefined)) {
      throw new Error(`Plugin ${packageName} can't render the setting '${setting.key}': a string setting ignores options and allowCustom.`)
    }
    if (setting.type === 'select' && (setting.options === undefined || setting.options.length === 0)) {
      throw new Error(`Plugin ${packageName} can't render the setting '${setting.key}': a select needs at least one option.`)
    }
  }
  return settings
}

export function readHarnessConfigEditor(value: unknown): HarnessConfigEditor | null {
  if (!isObjectRecord(value)) return null
  const { fileType, label, envReferences, template } = value
  if (typeof fileType !== 'string' || typeof label !== 'string' || typeof template !== 'string') return null
  if (!isStringArray(envReferences) || envReferences.length === 0) return null
  return { fileType, label, envReferences, template }
}

/** The declared settings' values in an agent config: trimmed, empty ones left out. */
export function pickSettingValues(fields: readonly AgentSettingField[], source: unknown): Record<string, string> {
  if (!isObjectRecord(source)) return {}
  const values: Record<string, string> = {}
  for (const field of fields) {
    const value = source[field.key]
    if (typeof value === 'string' && value.trim()) values[field.key] = value.trim()
  }
  return values
}

/** The settings a provider binding fills: its default model and endpoint, where the harness takes them. */
export function providerDefaultValues(
  fields: readonly AgentSettingField[],
  defaults: { model?: string; endpoint?: string },
): Record<string, string> {
  const values: Record<string, string> = {}
  for (const field of fields) {
    const value = field.providerDefault && defaults[field.providerDefault]
    if (value) values[field.key] = value
  }
  return values
}
