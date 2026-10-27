import { readSettingFields, type AgentSettingField } from "../src/agentSettings";

// Keys the agent config already uses for something else.
const RESERVED_SETTING_KEYS = new Set(["type", "signIn"]);

export function checkedSettings(packageName: string, raw: unknown): AgentSettingField[] {
  if (raw === undefined) return [];
  const settings = readSettingFields(raw);
  if (!Array.isArray(raw) || settings.length !== raw.length) {
    throw new Error(`Plugin ${packageName} has a malformed setting: each needs a key, a label, a type of string or select, and env.`);
  }
  const keys = new Set<string>();
  for (const setting of settings) {
    if (RESERVED_SETTING_KEYS.has(setting.key) || keys.has(setting.key)) {
      throw new Error(`Plugin ${packageName} can't use the setting key '${setting.key}': it's reserved or used twice.`);
    }
    if (setting.type === "string" && (setting.options || setting.allowCustom)) {
      throw new Error(
        `Plugin ${packageName} can't use options or allowCustom on the string setting '${setting.key}': the runner form shows a string as a plain text input.`,
      );
    }
    if (setting.type === "select" && !setting.options?.length) {
      throw new Error(
        `Plugin ${packageName} needs options on the select setting '${setting.key}': a select with none renders an empty dropdown.`,
      );
    }
    keys.add(setting.key);
  }
  return settings;
}
