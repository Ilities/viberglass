import { isObjectRecord } from "../src/clankerConfig";
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
    keys.add(setting.key);
  }
  settings.forEach((setting, index) => {
    const declared = raw[index];
    if (!isObjectRecord(declared)) return;
    if (setting.type === "string" && ("options" in declared || "allowCustom" in declared)) {
      throw new Error(
        `Plugin ${packageName} setting '${setting.key}' is a string, so it can't take options or allowCustom.`,
      );
    }
    if (setting.type === "select" && !(setting.options && setting.options.length > 0)) {
      throw new Error(`Plugin ${packageName} setting '${setting.key}' is a select with no options.`);
    }
  });
  return settings;
}
